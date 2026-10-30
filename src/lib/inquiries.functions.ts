import { createServerFn } from "@tanstack/react-start";
import { enforceRateLimit } from "./rate-limit.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

const FIELDS =
  "id, product_id, user_id, subject, status, last_message_at, created_at, " +
  "last_message_body, last_message_role, customer_read_at, merchant_read_at";

const STAFF_ROLES = ["admin", "super_admin", "support"] as const;

const MESSAGE_PAGE_SIZE = 50;

/** Satu notifikasi belum-baca per thread: perbarui bila ada, jangan banjir bell. */
async function notifyOnce(recipientId: string, title: string, message: string, inquiryId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("recipient_id", recipientId)
      .eq("related_type", "product_inquiry")
      .eq("related_id", inquiryId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("notifications")
        .update({ title, message, created_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }
    await supabaseAdmin.from("notifications").insert({
      recipient_id: recipientId,
      type: "product_inquiry",
      title,
      message,
      related_type: "product_inquiry",
      related_id: inquiryId,
    });
  } catch {
    /* notifikasi opsional */
  }
}

async function notifyStaff(title: string, message: string, inquiryId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", STAFF_ROLES);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    for (const id of ids) await notifyOnce(id, title, message, inquiryId);
  } catch {
    /* notifikasi opsional */
  }
}

async function notifySeller(storeId: string, title: string, message: string, inquiryId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("owner_id")
      .eq("id", storeId)
      .maybeSingle();
    if (!store?.owner_id) return;
    await notifyOnce(store.owner_id, title, message, inquiryId);
  } catch {
    /* notifikasi opsional */
  }
}

async function resolveStoreId(supabase: any, productId: string | null): Promise<string | null> {
  if (!productId) return null;
  const { data } = await supabase
    .from("digital_products")
    .select("store_id")
    .eq("id", productId)
    .maybeSingle();
  return (data?.store_id as string) ?? null;
}

/** Toko pemilik sebuah jasa; dipakai inquiry yang dimulai dari kartu jasa. */
async function resolveServiceStoreId(
  supabase: any,
  serviceId: string | null,
): Promise<string | null> {
  if (!serviceId) return null;
  const { data } = await supabase
    .from("marketplace_services")
    .select("store_id")
    .eq("id", serviceId)
    .maybeSingle();
  return (data?.store_id as string) ?? null;
}

async function isPlatformStore(storeId: string | null): Promise<boolean> {
  if (!storeId) return true;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("stores")
    .select("is_platform")
    .eq("id", storeId)
    .maybeSingle();
  return data?.is_platform === true;
}

export const createProductInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid().optional(),
        serviceId: z.string().uuid().optional(),
        /** Chat langsung ke toko (dari halaman profil toko), tanpa produk/jasa. */
        storeId: z.string().uuid().optional(),
        subject: z.string().trim().min(3).max(160),
        body: z.string().trim().min(3).max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "inquiry.create");
    if (limited) return { ok: false as const, error: limited.error };
    let storeId: string | null;
    if (data.storeId && !data.productId && !data.serviceId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: target } = await supabaseAdmin
        .from("stores")
        .select("id, owner_id, is_platform, status")
        .eq("id", data.storeId)
        .maybeSingle();
      if (!target || target.status !== "active") {
        return { ok: false as const, error: "Toko tidak ditemukan." };
      }
      if (target.owner_id === userId) {
        return { ok: false as const, error: "Ini tokomu sendiri." };
      }
      // Toko resmi = produk platform: dilayani admin/support (store_id NULL),
      // sama seperti chat produk resmi.
      storeId = target.is_platform ? null : (target.id as string);
    } else {
      storeId = data.serviceId
        ? await resolveServiceStoreId(supabase, data.serviceId)
        : await resolveStoreId(supabase, data.productId ?? null);
    }
    const { data: row, error } = await supabase
      .from("product_inquiries")
      .insert({
        user_id: userId,
        product_id: data.productId ?? null,
        service_id: data.serviceId ?? null,
        subject: data.subject,
        store_id: storeId,
      })
      .select("id")
      .maybeSingle();
    if (error || !row) return { ok: false as const, error: "Pertanyaan gagal dikirim. Coba lagi." };

    const { error: msgError } = await supabase.from("product_inquiry_messages").insert({
      inquiry_id: row.id,
      sender_id: userId,
      sender_role: "customer",
      body: data.body,
    });
    if (msgError) return { ok: false as const, error: "Pesan gagal dikirim. Coba lagi." };

    const official = await isPlatformStore(storeId);
    if (storeId && !official) {
      await notifySeller(storeId, "Pertanyaan produk baru", data.subject, row.id as string);
    } else {
      await notifyStaff("Pertanyaan produk baru", data.subject, row.id as string);
    }
    return { ok: true as const, id: row.id as string };
  });

/**
 * Thread terbuka milik pembeli dengan toko yang sama, supaya tombol Chat
 * melanjutkan percakapan lama. Thread produk yang sama diutamakan.
 */
export const findMyStoreThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ storeId: z.string().uuid().optional(), productId: z.string().uuid().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    let storeId = data.storeId ?? null;
    if (!storeId && data.productId) storeId = await resolveStoreId(supabase, data.productId);
    const official = await isPlatformStore(storeId);

    let query = supabase
      .from("product_inquiries")
      .select("id, product_id")
      .eq("user_id", userId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(20);
    // Toko resmi: thread bisa ber-store_id NULL atau id toko platform.
    query = official
      ? storeId
        ? query.or(`store_id.is.null,store_id.eq.${storeId}`)
        : query.is("store_id", null)
      : query.eq("store_id", storeId);
    const { data: rows } = await query;
    const list = (rows ?? []) as { id: string; product_id: string | null }[];
    const hit = (data.productId && list.find((r) => r.product_id === data.productId)) || list[0];
    return { id: hit?.id ?? null };
  });

export const listMyInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("product_inquiries")
      .select(FIELDS)
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(50);
    if (error) return { items: [], error: "Daftar chat tidak dapat dimuat." as const };
    return { items: data ?? [], error: null };
  });

export const listAllInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ status: z.string().max(20).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let query = supabase
      .from("product_inquiries")
      .select(FIELDS)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) return { items: [], error: "Daftar chat tidak dapat dimuat." as const };

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.full_name || p.email || "Pelanggan");
    }
    return {
      items: (rows ?? []).map((r: any) => ({
        ...r,
        customer_name: nameById.get(r.user_id) ?? "Pelanggan",
      })),
      error: null,
    };
  });

export const getInquiry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: inquiry } = await supabase
      .from("product_inquiries")
      .select(FIELDS + ", store_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!inquiry)
      return {
        inquiry: null,
        messages: [],
        product: null,
        store: null,
        isOwner: false,
        isSeller: false,
        customerName: null,
        hasMore: false,
        oldest: null,
      };

    const storeId = (inquiry as any).store_id as string | null;
    const myStoreId = (await supabase.rpc("my_store_id")).data as string | null;
    const isSeller = Boolean(storeId && myStoreId && storeId === myStoreId);

    // Jendela terbaru dulu (desc), lalu dibalik ascending untuk render.
    const [rawMessages, productResult, { data: profile }, storeResult] = await Promise.all([
      supabase
        .from("product_inquiry_messages")
        .select("id, sender_id, sender_role, body, is_system, created_at, attachment")
        .eq("inquiry_id", data.id)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1),
      inquiry.product_id
        ? supabase
            .from("digital_products")
            .select("id, name, slug, thumbnail_url, price, discount_price")
            .eq("id", inquiry.product_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("profiles").select("full_name, email").eq("id", inquiry.user_id).maybeSingle(),
      storeId
        ? supabase
            .from("stores")
            .select("id, name, slug, is_platform")
            .eq("id", storeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const hasMore = (rawMessages.data?.length ?? 0) > MESSAGE_PAGE_SIZE;
    const windowDesc = (rawMessages.data ?? []).slice(0, MESSAGE_PAGE_SIZE);
    const messages = [...windowDesc].reverse();
    const oldest = messages[0]?.created_at ?? null;

    return {
      inquiry,
      messages,
      hasMore,
      oldest,
      product: productResult.data ?? null,
      store: storeResult.data ?? null,
      isOwner: inquiry.user_id === userId,
      isSeller,
      customerName: profile?.full_name || profile?.email || "Pelanggan",
    };
  });

/** Halaman pesan lebih lama untuk load more; RLS mengembalikan kosong untuk non-peserta. */
export const getInquiryMessagesPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        before: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: raw } = await supabase
      .from("product_inquiry_messages")
      .select("id, sender_id, sender_role, body, is_system, created_at, attachment")
      .eq("inquiry_id", data.id)
      .lt("created_at", data.before)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    const hasMore = (raw?.length ?? 0) > MESSAGE_PAGE_SIZE;
    const windowDesc = (raw ?? []).slice(0, MESSAGE_PAGE_SIZE);
    const messages = [...windowDesc].reverse();
    return { messages, hasMore, oldest: messages[0]?.created_at ?? null };
  });

// ---------------------------------------------------------------------------
// Lampiran chat (migration 20261029140000). Bucket privat `chat-attachments`;
// path selalu diawali id thread supaya file bisa dicek kepemilikannya.
// ---------------------------------------------------------------------------

const CHAT_BUCKET = "chat-attachments";
const CHAT_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const attachmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["image", "file"]),
    path: z.string().min(10).max(300),
    name: z.string().trim().min(1).max(160),
    mime: z.string().max(120),
    size: z.number().int().min(1).max(CHAT_MAX_BYTES),
  }),
  z.object({
    kind: z.literal("location"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
]);

export type ChatAttachment = z.infer<typeof attachmentSchema>;

/** Peserta thread? RLS SELECT sudah membatasi ke pembeli/seller toko/staff. */
async function canAccessThread(supabase: any, inquiryId: string) {
  const { data } = await supabase
    .from("product_inquiries")
    .select("id, status")
    .eq("id", inquiryId)
    .maybeSingle();
  return data as { id: string; status: string } | null;
}

export const prepareChatUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        mimeType: z.string().max(120),
        sizeBytes: z.number().int().min(1).max(CHAT_MAX_BYTES),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const ext = CHAT_MIME_EXT[data.mimeType];
    if (!ext) return { ok: false as const, error: "Jenis file ini tidak didukung." };
    const limited = await enforceRateLimit(userId, "inquiry.message");
    if (limited) return { ok: false as const, error: limited.error };
    const thread = await canAccessThread(supabase, data.inquiryId);
    if (!thread) return { ok: false as const, error: "Percakapan tidak ditemukan." };
    if (thread.status === "closed") return { ok: false as const, error: "Percakapan sudah ditutup." };

    const path = `${data.inquiryId}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await (supabaseAdmin as any).storage
      .from(CHAT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, error: "Gagal menyiapkan unggahan." };
    return { ok: true as const, bucket: CHAT_BUCKET, path, token: signed.token as string };
  });

/** Signed URL baca (1 jam) untuk lampiran di satu thread yang boleh diakses pemanggil. */
export const getChatAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ inquiryId: z.string().uuid(), paths: z.array(z.string().max(300)).max(100) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const thread = await canAccessThread(supabase, data.inquiryId);
    const paths = data.paths.filter((p) => p.startsWith(`${data.inquiryId}/`));
    if (!thread || !paths.length) return { urls: {} as Record<string, string> };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await (supabaseAdmin as any).storage
      .from(CHAT_BUCKET)
      .createSignedUrls(paths, 3600);
    const urls: Record<string, string> = {};
    for (const s of (signed ?? []) as { path: string; signedUrl: string }[]) {
      if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
    }
    return { urls };
  });

export const sendInquiryMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        inquiryId: z.string().uuid(),
        body: z.string().trim().max(2000),
        attachment: attachmentSchema.optional(),
      })
      .refine((d) => d.body.length > 0 || d.attachment, "Pesan kosong.")
      .refine(
        (d) =>
          !d.attachment ||
          d.attachment.kind === "location" ||
          d.attachment.path.startsWith(`${d.inquiryId}/`),
        "Lampiran tidak valid.",
      )
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "inquiry.message");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: inquiry } = await supabase
      .from("product_inquiries")
      .select("id, user_id, subject, status, store_id")
      .eq("id", data.inquiryId)
      .maybeSingle();
    if (!inquiry) return { ok: false as const, error: "Percakapan tidak ditemukan." };
    if (inquiry.status === "closed")
      return { ok: false as const, error: "Percakapan sudah ditutup." };

    const isOwner = inquiry.user_id === userId;
    const myStoreId = isOwner ? null : ((await supabase.rpc("my_store_id")).data as string | null);
    const isSeller = Boolean(
      !isOwner && inquiry.store_id && myStoreId && inquiry.store_id === myStoreId,
    );

    let senderRole: string;
    if (isOwner) {
      senderRole = "customer";
    } else if (isSeller) {
      senderRole = "seller";
    } else {
      senderRole = "staff";
    }

    const { error } = await supabase.from("product_inquiry_messages").insert({
      inquiry_id: data.inquiryId,
      sender_id: userId,
      sender_role: senderRole,
      body: data.body,
      attachment: data.attachment ?? null,
    });
    if (error) return { ok: false as const, error: "Pesan gagal dikirim. Coba lagi." };

    if (isOwner) {
      const official = await isPlatformStore(inquiry.store_id);
      if (inquiry.store_id && !official) {
        await notifySeller(
          inquiry.store_id,
          "Pesan baru di chat produk",
          inquiry.subject,
          inquiry.id as string,
        );
      } else {
        await notifyStaff("Pesan baru di chat produk", inquiry.subject, inquiry.id as string);
      }
    } else {
      await notifyOnce(
        inquiry.user_id,
        isSeller ? "Balasan dari penjual" : "Balasan tim Ebrystore",
        `Ada balasan untuk pertanyaan "${inquiry.subject}".`,
        inquiry.id as string,
      );
    }
    return { ok: true as const };
  });

/** Tandai thread terbaca sesuai peran pemanggil (pembeli/seller/staff). */
export const markInquiryRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ inquiryId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("mark_inquiry_read", {
      _inquiry_id: data.inquiryId,
    });
    if (error) return { ok: false as const, error: "Status baca gagal disimpan." };
    return { ok: true as const };
  });

/** Badge unread per thread untuk sudut pandang pemanggil; gagal = kosong (kenyamanan). */
export const listInquiryUnreadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase.rpc("unread_inquiry_counts");
    if (error) return { items: [] as { inquiry_id: string; unread: number }[] };
    return { items: (data ?? []) as { inquiry_id: string; unread: number }[] };
  });

export const setInquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ inquiryId: z.string().uuid(), status: z.enum(["open", "answered", "closed"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase
      .from("product_inquiries")
      .update({ status: data.status })
      .eq("id", data.inquiryId);
    if (error) return { ok: false as const, error: "Status gagal diperbarui." };
    return { ok: true as const };
  });

export const listSellerInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ status: z.string().max(20).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const storeId = (await supabase.rpc("my_store_id")).data as string | null;
    if (!storeId) return { items: [], error: null };

    let query = supabase
      .from("product_inquiries")
      .select(FIELDS + ", store_id")
      .eq("store_id", storeId)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) return { items: [], error: "Daftar chat tidak dapat dimuat." as const };

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.full_name || p.email || "Pelanggan");
    }
    return {
      items: (rows ?? []).map((r: any) => ({
        ...r,
        customer_name: nameById.get(r.user_id) ?? "Pelanggan",
      })),
      error: null,
    };
  });
