import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  marketplaceServiceCheckoutSchema,
  marketplaceServiceAcceptSchema,
  marketplaceServiceActionSchema,
  marketplaceServiceCancelOverdueSchema,
  marketplaceServiceComplaintSchema,
  marketplaceServiceExtensionRequestSchema,
  marketplaceServiceExtensionResponseSchema,
  marketplaceServiceRejectSchema,
  marketplaceServiceDeliverySchema,
  marketplaceServiceDraftSchema,
  marketplaceServiceResolutionSchema,
  marketplaceServiceRevisionSchema,
  MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES,
  MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES,
  MARKETPLACE_SERVICE_IMAGE_MAX_BYTES,
  MARKETPLACE_SERVICE_MEDIA_MIME_TYPES,
  MARKETPLACE_SERVICE_VIDEO_MAX_BYTES,
  type MarketplaceServiceListing,
  type PublicMarketplaceService,
  type MarketplaceServiceOrderRow,
  type SellerServiceOrderDetail,
} from "./marketplace-service";
import { assertPermission } from "./authz.server";
import { enforceRateLimit } from "./rate-limit.server";

type Ctx = { supabase: any; userId: string };
const listingFields =
  "id, store_id, category_id, name, price, agreement, media, status, version, moderation_note, created_at";
const pageSchema = z.object({ page: z.number().int().min(0).max(10_000).default(0) }).strict();
const pageSize = 20;

function mutationError(message: string) {
  if (message.includes("STALE_LISTING"))
    return "Listing sudah berubah. Muat ulang sebelum menyimpan.";
  if (message.includes("SELF_MODERATION_DENIED"))
    return "Listing sendiri harus ditinjau moderator lain.";
  if (message.includes("NO_ACTIVE_STORE")) return "Toko harus aktif untuk mengelola jasa.";
  if (message.includes("INVALID_CATEGORY"))
    return "Kategori jasa sudah tidak aktif. Pilih kategori lain.";
  if (message.includes("INVALID_MEDIA"))
    return "Media jasa tidak valid. Periksa jumlah, format, dan ukurannya.";
  if (message.includes("MEDIA_NOT_FOUND"))
    return "Berkas media belum terunggah sepenuhnya. Unggah ulang lalu simpan.";
  return "Aksi jasa gagal disimpan. Muat ulang dan periksa status serta izin Anda.";
}

export const listMyMarketplaceServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => pageSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, status")
      .eq("owner_id", userId)
      .maybeSingle();
    if (storeError) throw new Error("Toko tidak dapat dimuat.");
    if (!store || store.status !== "active")
      throw new Error("Toko aktif diperlukan untuk mengelola jasa.");
    const [listings, categories] = await Promise.all([
      supabase
        .from("marketplace_services")
        .select(listingFields, { count: "exact" })
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(data.page * pageSize, (data.page + 1) * pageSize - 1),
      supabase
        .from("categories")
        .select("id, name")
        .eq("kind", "service")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order")
        .order("id"),
    ]);
    if (listings.error || categories.error)
      throw new Error("Katalog jasa tidak dapat dimuat. Migration lokal belum tentu diterapkan.");
    return {
      items: listings.data as MarketplaceServiceListing[],
      categories: categories.data as { id: string; name: string }[],
      total: Number(listings.count),
      pageSize,
    };
  });

export const saveMyMarketplaceService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceDraftSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await supabase.rpc("save_marketplace_service_draft", {
      _id: data.id ?? null,
      _expected_version: data.expectedVersion ?? null,
      _name: data.name,
      _category_id: data.categoryId,
      _price: data.price,
      _agreement: data.agreement,
      _media: data.media,
    });
    if (error) return { ok: false as const, error: mutationError(error.message) };
    return { ok: true as const };
  });

/**
 * Siapkan unggahan media jasa lewat signed URL. Path selalu di bucket privat
 * service-media dan diverifikasi kepemilikannya sebelum token dibuat.
 */
export const prepareServiceMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        listingId: z.string().uuid().nullable(),
        mimeType: z.enum(MARKETPLACE_SERVICE_MEDIA_MIME_TYPES),
        sizeBytes: z.number().int().min(1).max(MARKETPLACE_SERVICE_VIDEO_MAX_BYTES),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const isVideo = data.mimeType.startsWith("video/");
    if (!isVideo && data.sizeBytes > MARKETPLACE_SERVICE_IMAGE_MAX_BYTES)
      return { ok: false as const, error: "Ukuran gambar maksimal 5 MB." };
    if (isVideo && data.sizeBytes > MARKETPLACE_SERVICE_VIDEO_MAX_BYTES)
      return { ok: false as const, error: "Ukuran video maksimal 25 MB." };

    const { data: store } = await ctx.supabase
      .from("stores")
      .select("id, status")
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    if (!store || store.status !== "active")
      return { ok: false as const, error: "Toko harus aktif untuk mengunggah media." };

    // Listing baru belum punya id; pakai folder store agar tetap ter-scope pemilik.
    if (data.listingId) {
      const { data: listing } = await ctx.supabase
        .from("marketplace_services")
        .select("id, store_id")
        .eq("id", data.listingId)
        .maybeSingle();
      if (!listing || listing.store_id !== store.id)
        return { ok: false as const, error: "Jasa bukan milik toko Anda." };
    }

    const extension =
      data.mimeType === "image/jpeg"
        ? "jpg"
        : data.mimeType === "image/png"
          ? "png"
          : data.mimeType === "image/webp"
            ? "webp"
            : data.mimeType === "image/avif"
              ? "avif"
              : data.mimeType === "video/mp4"
                ? "mp4"
                : "webm";
    const folder = data.listingId ?? `store/${store.id}`;
    const path = `service-media/${folder}/${crypto.randomUUID()}.${extension}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("service-media")
      .createSignedUploadUrl(path);
    if (error || !signed)
      return { ok: false as const, error: "Gagal menyiapkan unggahan media. Coba lagi." };
    return { ok: true as const, path, token: signed.token };
  });

export const actOnMyMarketplaceService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    marketplaceServiceActionSchema
      .refine((value) => ["submit", "archive"].includes(value.action), {
        message: "Aksi seller tidak valid.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await supabase.rpc("transition_marketplace_service", {
      _id: data.id,
      _expected_version: data.expectedVersion,
      _action: data.action,
      _reason: "",
    });
    if (error) return { ok: false as const, error: mutationError(error.message) };
    return { ok: true as const };
  });

export const listMarketplaceServiceModeration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => pageSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPermission(ctx, "services.view");
    const {
      data: rows,
      error,
      count,
    } = await ctx.supabase
      .from("marketplace_services")
      .select(listingFields, { count: "exact" })
      .eq("status", "in_review")
      .order("created_at")
      .order("id")
      .range(data.page * pageSize, (data.page + 1) * pageSize - 1);
    if (error) throw new Error("Antrean moderasi jasa tidak dapat dimuat.");
    return { items: rows as MarketplaceServiceListing[], total: Number(count), pageSize };
  });

export const moderateMarketplaceService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    marketplaceServiceActionSchema
      .refine((value) => ["approve", "reject"].includes(value.action), {
        message: "Keputusan moderasi tidak valid.",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPermission(ctx, "services.update");
    const limited = await enforceRateLimit(ctx.userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await ctx.supabase.rpc("transition_marketplace_service", {
      _id: data.id,
      _expected_version: data.expectedVersion,
      _action: data.action,
      _reason: data.reason,
    });
    if (error) return { ok: false as const, error: mutationError(error.message) };
    return { ok: true as const };
  });

function checkoutError(message: string) {
  if (message.includes("SELF_PURCHASE_DENIED"))
    return "Anda tidak dapat membeli jasa dari toko sendiri.";
  if (message.includes("STALE_QUOTE"))
    return "Harga atau kesepakatan berubah. Muat ulang lalu periksa kembali sebelum memesan.";
  if (message.includes("SERVICE_UNAVAILABLE"))
    return "Jasa tidak tersedia. Toko, kategori, atau persetujuannya sudah berubah.";
  if (message.includes("CHECKOUT_DISABLED")) return "Checkout sedang dinonaktifkan oleh admin.";
  if (message.includes("FORBIDDEN")) return "Akun ini tidak memiliki izin membuat pesanan.";
  if (message.includes("IDEMPOTENCY_CONFLICT"))
    return "Kunci pesanan sudah digunakan untuk transaksi lain. Buka ulang checkout.";
  return "Pesanan belum terpastikan. Coba lagi dengan formulir yang sama atau periksa daftar pesanan.";
}

export type MarketplaceServiceQuote = PublicMarketplaceService & {
  version: number;
  adminFee: number;
  total: number;
};

export const quoteMarketplaceServiceOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ serviceId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { data: quote, error } = await (context as Ctx).supabase.rpc(
      "quote_marketplace_service_order",
      {
        _service_id: data.serviceId,
      },
    );
    if (error) return { quote: null, error: checkoutError(error.message) };
    return { quote: quote as MarketplaceServiceQuote, error: null };
  });

export const createMarketplaceServiceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceCheckoutSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: result, error } = await ctx.supabase.rpc("create_marketplace_service_order", {
      _service_id: data.serviceId,
      _idempotency_key: data.idempotencyKey,
      _expected_version: data.expectedVersion,
      _expected_total: data.expectedTotal,
      _requirements: data.requirements,
      _agreement_accepted: data.agreementAccepted,
    });
    if (error)
      return {
        ok: false as const,
        error: checkoutError(error.message),
        stale: error.message.includes("STALE_QUOTE"),
      };
    return {
      ok: true as const,
      ...(result as { order_id: string; order_number: string; duplicate: boolean }),
    };
  });

/* ---------------- Pesanan jasa ---------------- */

function orderError(message: string) {
  if (message.includes("SERVICE_POST_ACCEPTANCE_REFUND_UNAVAILABLE"))
    return "Refund setelah penerimaan belum tersedia. Hubungi admin untuk komplain.";
  if (message.includes("ACCEPTANCE_REQUIRED") || message.includes("RECEIPT_REQUIRED"))
    return "Dana belum dapat dilepas tanpa penerimaan pembeli.";
  if (message.includes("REVISION_ALLOWANCE_EXHAUSTED"))
    return "Jatah revisi sudah habis. Ajukan komplain bila hasil tidak sesuai agreement.";
  if (message.includes("DELIVERY_SUPERSEDED"))
    return "Delivery sudah digantikan versi lebih baru. Muat ulang halaman.";
  if (message.includes("COMPLAINT_ACTIVE"))
    return "Komplain sedang ditinjau admin. Tunggu keputusan.";
  if (message.includes("REQUIREMENTS_NOT_APPROVED"))
    return "Setujui requirements pembeli terlebih dahulu.";
  if (message.includes("SERVICE_ORDER_CONTRACT_MISSING"))
    return "Kontrak order jasa tidak ditemukan. Muat ulang atau hubungi admin.";
  if (message.includes("EXTENSION_PENDING"))
    return "Masih ada pengajuan perpanjangan yang menunggu jawaban pembeli.";
  if (message.includes("EXTENSION_LIMIT")) return "Perpanjangan maksimal 2 kali per pesanan.";
  if (message.includes("NO_EXTENSION"))
    return "Tidak ada pengajuan perpanjangan yang perlu dijawab.";
  if (message.includes("INVALID_DAYS")) return "Perpanjangan 1 sampai 14 hari.";
  if (message.includes("NOT_OVERDUE"))
    return "Tenggat belum lewat. Pembatalan tersedia setelah tenggat terlewati.";
  if (message.includes("REFUND_ACTIVE"))
    return "Pesanan ini sudah memiliki proses refund berjalan.";
  if (message.includes("REASON_REQUIRED")) return "Alasan minimal 10 karakter.";
  if (message.includes("URL_REQUIRED")) return "URL wajib HTTPS tanpa kredensial di dalamnya.";
  if (message.includes("NO_ACTIVE_STORE")) return "Toko harus aktif untuk mengelola pesanan jasa.";
  if (message.includes("INVALID_STATE"))
    return "Status pesanan saat ini tidak mengizinkan aksi ini. Muat ulang halaman.";
  return "Aksi pesanan jasa gagal diproses. Muat ulang dan coba lagi.";
}

function rpcErrorResult(error: { message: string } | null) {
  if (error) return { ok: false as const, error: orderError(error.message) };
  return null;
}

/** Detail pesanan jasa untuk pembeli; RLS orders membatasi ke order milik sendiri. */
export const getServiceOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ orderId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, order_type, status, total, paid_at, completed_at, created_at")
      .eq("id", data.orderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!order || order.order_type !== "marketplace_service") {
      return { order: null, contract: null, deliveries: [], events: [], error: null };
    }
    const [contract, deliveries, events] = await Promise.all([
      supabase
        .from("marketplace_service_orders")
        .select("*")
        .eq("order_id", order.id)
        .maybeSingle(),
      supabase
        .from("marketplace_service_deliveries")
        .select("id, order_id, version, kind, url, note, summary, created_at")
        .eq("order_id", order.id)
        .order("version", { ascending: false }),
      supabase
        .from("marketplace_service_events")
        .select("id, order_id, event_type, actor_role, payload, created_at")
        .eq("order_id", order.id)
        .order("id", { ascending: true }),
    ]);
    if (contract.error || deliveries.error || events.error)
      throw new Error("Detail pesanan jasa gagal dimuat.");
    return {
      order,
      contract: contract.data,
      deliveries: deliveries.data ?? [],
      events: events.data ?? [],
      error: contract.data
        ? null
        : ("Kontrak order jasa belum tersedia untuk pesanan ini." as const),
    };
  });

export const acceptServiceDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceAcceptSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("accept_service_delivery", {
      _order_id: data.orderId,
      _delivery_id: data.deliveryId,
    });
    const failed = rpcErrorResult(error);
    if (failed) return failed;

    // Email "transaksi selesai" ke pembeli dan penjual. Kegagalan email tidak
    // membatalkan penerimaan yang sudah tercatat.
    try {
      const { dispatchEmails } = await import("./email-dispatch.server");
      await dispatchEmails(5);
    } catch (err) {
      console.error("[email] dispatch setelah penerimaan jasa gagal:", err);
    }

    return { ok: true as const };
  });

export const requestServiceRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceRevisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("request_service_revision", {
      _order_id: data.orderId,
      _delivery_id: data.deliveryId,
      _reason: data.reason,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

export const openServiceComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceComplaintSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("open_service_complaint", {
      _order_id: data.orderId,
      _reason: data.reason,
      _delivery_id: data.deliveryId ?? null,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

/** Pembeli menyetujui atau menolak perpanjangan tenggat dari seller. */
export const respondServiceExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceExtensionResponseSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("respond_service_extension", {
      _order_id: data.orderId,
      _approve: data.approve,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

/** Pembeli membatalkan pesanan yang lewat tenggat tanpa hasil; dana kembali ke saldo. */
export const cancelOverdueServiceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceCancelOverdueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("cancel_overdue_service_order", {
      _order_id: data.orderId,
      _reason: data.reason || null,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

export const listMyServiceOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase.rpc("list_my_service_orders");
    if (error) throw new Error("Daftar pesanan jasa gagal dimuat. Muat ulang halaman.");
    return { items: (data ?? []) as MarketplaceServiceOrderRow[] };
  });

export const getSellerServiceOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ orderId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context as Ctx).supabase.rpc("get_my_service_order", {
      _order_id: data.orderId,
    });
    if (error) throw new Error("Detail pesanan jasa gagal dimuat.");
    const detail = (result ?? null) as SellerServiceOrderDetail | null;
    return { detail };
  });

export const approveServiceRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ orderId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("approve_service_requirements", {
      _order_id: data.orderId,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

/** Seller menolak kebutuhan pembeli; pesanan dibatalkan dan dana kembali ke saldo pembeli. */
export const rejectServiceRequirements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceRejectSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("reject_service_requirements", {
      _order_id: data.orderId,
      _reason: data.reason,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

/** Seller mengajukan tambahan hari; berlaku setelah pembeli menyetujui. */
export const requestServiceExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceExtensionRequestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("request_service_extension", {
      _order_id: data.orderId,
      _days: data.days,
      _reason: data.reason,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

export const submitServiceDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceDeliverySchema.parse(data))
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await (context as Ctx).supabase.rpc("submit_service_delivery", {
      _order_id: data.orderId,
      _kind: data.kind,
      _url: data.url ?? null,
      _note: data.note ?? null,
      _summary: data.summary,
      _storage_path: data.storagePath ?? null,
      _original_name: data.originalName ?? null,
      _mime_type: data.mimeType ?? null,
      _file_size: data.fileSize ?? null,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });

/**
 * Siapkan unggahan artifact delivery lewat signed upload URL. Path selalu
 * diawali order_id agar policy storage dapat memverifikasi keanggotaan pesanan.
 */
export const prepareServiceDeliveryUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        mimeType: z.enum(MARKETPLACE_SERVICE_DELIVERY_MIME_TYPES),
        sizeBytes: z.number().int().min(1).max(MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES),
        originalName: z.string().trim().min(1).max(255),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: store } = await ctx.supabase
      .from("stores")
      .select("id, status")
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    if (!store || store.status !== "active")
      return { ok: false as const, error: "Toko harus aktif untuk mengirim hasil." };
    const { data: contract } = await ctx.supabase
      .from("marketplace_service_orders")
      .select("order_id, store_id, work_state, complaint_open, requirements_approved_at")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (
      !contract ||
      contract.store_id !== store.id ||
      contract.complaint_open ||
      contract.requirements_approved_at === null ||
      !["in_progress", "revision_requested"].includes(contract.work_state)
    )
      return { ok: false as const, error: "Pesanan tidak sedang menerima hasil pekerjaan." };
    const extension =
      data.mimeType === "application/pdf"
        ? "pdf"
        : data.mimeType === "application/zip"
          ? "zip"
          : data.mimeType === "text/plain"
            ? "txt"
            : data.mimeType === "image/png"
              ? "png"
              : data.mimeType === "image/jpeg"
                ? "jpg"
                : data.mimeType === "image/webp"
                  ? "webp"
                  : data.mimeType.includes("wordprocessingml")
                    ? "docx"
                    : data.mimeType === "application/msword"
                      ? "doc"
                      : data.mimeType.includes("spreadsheetml")
                        ? "xlsx"
                        : data.mimeType === "application/vnd.ms-excel"
                          ? "xls"
                          : "pptx";
    const path = `${data.orderId}/${crypto.randomUUID()}.${extension}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("service-deliveries")
      .createSignedUploadUrl(path);
    if (error || !signed)
      return { ok: false as const, error: "Gagal menyiapkan unggahan berkas. Coba lagi." };
    return { ok: true as const, path, token: signed.token };
  });

/**
 * Signed URL unduhan artifact. Peserta pesanan (pembeli, seller, atau staf
 * dengan orders.view) diverifikasi dulu; URL berumur pendek dan memaksa unduh
 * dengan nama asli berkas.
 */
export const getServiceDeliveryFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ deliveryId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: delivery } = await ctx.supabase
      .from("marketplace_service_deliveries")
      .select("id, order_id, kind, storage_path, original_name")
      .eq("id", data.deliveryId)
      .maybeSingle();
    if (!delivery || delivery.kind !== "file" || !delivery.storage_path)
      return { ok: false as const, error: "Berkas tidak ditemukan." };
    const { data: allowed } = await ctx.supabase.rpc("is_service_order_buyer", {
      _order_id: delivery.order_id,
    });
    let permitted = allowed === true;
    if (!permitted) {
      const { data: seller } = await ctx.supabase.rpc("is_service_order_seller", {
        _order_id: delivery.order_id,
      });
      permitted = seller === true;
    }
    if (!permitted) {
      const { data: staff } = await ctx.supabase.rpc("has_permission", {
        _user_id: ctx.userId,
        _permission: "orders.view",
      });
      permitted = staff === true;
    }
    if (!permitted) return { ok: false as const, error: "Tidak berhak mengunduh berkas ini." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("service-deliveries")
      .createSignedUrl(
        delivery.storage_path,
        300,
        delivery.original_name ? { download: delivery.original_name } : undefined,
      );
    if (error || !signed)
      return { ok: false as const, error: "Gagal menyiapkan tautan unduhan. Coba lagi." };
    return { ok: true as const, url: signed.signedUrl };
  });

/** Antrean komplain jasa untuk admin transaksi. */
export const listOpenServiceComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => pageSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPermission(ctx, "orders.view");
    const {
      data: rows,
      error,
      count,
    } = await ctx.supabase
      .from("marketplace_service_orders")
      .select(
        "order_id, work_state, complaint_open, revision_used, revision_limit, agreement, orders!inner(order_number, status, total, user_id, created_at)",
        { count: "exact" },
      )
      .eq("complaint_open", true)
      .order("order_id")
      .range(data.page * pageSize, (data.page + 1) * pageSize - 1);
    if (error) throw new Error("Antrean komplain jasa gagal dimuat.");
    return { items: rows ?? [], total: Number(count), pageSize };
  });

export const resolveServiceComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => marketplaceServiceResolutionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertPermission(ctx, data.decision === "resume" ? "orders.update" : "refunds.approve");
    const limited = await enforceRateLimit(ctx.userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await ctx.supabase.rpc("resolve_service_complaint", {
      _order_id: data.orderId,
      _decision: data.decision,
      _reason: data.reason,
    });
    return rpcErrorResult(error) ?? { ok: true as const };
  });
