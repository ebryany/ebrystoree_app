import { createServerFn } from "@tanstack/react-start";
import { enforceRateLimit } from "./rate-limit.server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { priceDetails } from "@/lib/format";

type Ctx = { supabase: any; userId: string };

const FIELDS =
  "id, product_id, service_id, store_id, user_id, subject, status, last_message_at, created_at, " +
  "last_message_body, last_message_role, customer_read_at, merchant_read_at";

const MESSAGE_FIELDS_RICH =
  "id, sender_id, sender_role, body, is_system, created_at, attachment, reply_to_id, reactions, edited_at, deleted_at";
const MESSAGE_FIELDS_BASE =
  "id, sender_id, sender_role, body, is_system, created_at, attachment";

const STAFF_ROLES = ["admin", "super_admin", "support"] as const;

const MESSAGE_PAGE_SIZE = 50;

export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "🔥"] as const;

export function normalizeChatMime(raw: string): string {
  return raw.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isMissingColumnError(error: any): boolean {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  return code === "42703" || msg.includes("does not exist");
}

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
 * melanjutkan percakapan lama. Thread produk/jasa yang sama diutamakan.
 */
export const findMyStoreThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        serviceId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    let storeId = data.storeId ?? null;
    if (!storeId && data.serviceId) storeId = await resolveServiceStoreId(supabase, data.serviceId);
    if (!storeId && data.productId) storeId = await resolveStoreId(supabase, data.productId);
    const official = await isPlatformStore(storeId);

    let query = supabase
      .from("product_inquiries")
      .select("id, product_id, service_id")
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
    const list = (rows ?? []) as { id: string; product_id: string | null; service_id: string | null }[];
    const hit =
      (data.serviceId && list.find((r) => r.service_id === data.serviceId)) ||
      (data.productId && list.find((r) => r.product_id === data.productId)) ||
      list[0];
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

    const rows = (data ?? []) as any[];
    const storeIds = Array.from(
      new Set(rows.map((r) => r.store_id).filter((id): id is string => Boolean(id))),
    );
    const storeById = new Map<string, { name: string; slug: string; logo_url: string | null }>();
    if (storeIds.length) {
      const { data: stores } = await supabase
        .from("stores")
        .select("id, name, slug, logo_url")
        .in("id", storeIds);
      for (const s of stores ?? []) {
        storeById.set(s.id, { name: s.name, slug: s.slug, logo_url: s.logo_url ?? null });
      }
    }

    return {
      items: rows.map((r) => {
        const store = r.store_id ? storeById.get(r.store_id) : null;
        return {
          ...r,
          store_name: store?.name ?? "Tim Ebrystore",
          store_slug: store?.slug ?? null,
          store_logo_url: store?.logo_url ?? null,
        };
      }),
      error: null,
    };
  });

export const listAllInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ status: z.string().max(20).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { assertPermission } = await import("./authz.server");
    try {
      await assertPermission(ctx, "orders.view", { endpoint: "serverFn:inquiries:listAllInquiries" });
    } catch {
      return { items: [], error: "Akses ditolak.", forbidden: true as const };
    }
    const { supabase } = ctx;
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

async function queryMessagesWindow(
  supabase: any,
  inquiryId: string,
  before?: string,
): Promise<{ data: any[] | null; error: any }> {
  const run = async (fields: string) => {
    let q = supabase
      .from("product_inquiry_messages")
      .select(fields)
      .eq("inquiry_id", inquiryId);
    if (before) q = q.lt("created_at", before);
    return q.order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
  };
  const first = await run(MESSAGE_FIELDS_RICH);
  if (first.error && isMissingColumnError(first.error)) {
    return run(MESSAGE_FIELDS_BASE);
  }
  return first;
}

export const getInquiry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: inquiry } = await supabase
      .from("product_inquiries")
      .select(FIELDS)
      .eq("id", data.id)
      .maybeSingle();
    if (!inquiry)
      return {
        inquiry: null,
        messages: [],
        replyTargets: {} as Record<string, any>,
        product: null,
        service: null,
        store: null,
        isOwner: false,
        isSeller: false,
        customerName: null,
        hasMore: false,
        oldest: null,
      };

    const storeId = (inquiry as any).store_id as string | null;
    const serviceId = (inquiry as any).service_id as string | null;
    const myStoreId = (await supabase.rpc("my_store_id")).data as string | null;
    const isSeller = Boolean(storeId && myStoreId && storeId === myStoreId);

    // Jendela terbaru dulu (desc), lalu dibalik ascending untuk render.
    const [rawMessages, productResult, serviceResult, { data: profile }, storeResult] =
      await Promise.all([
        queryMessagesWindow(supabase, data.id),
        inquiry.product_id
          ? supabase
              .from("digital_products")
              .select("id, name, slug, thumbnail_url, price, discount_price")
              .eq("id", inquiry.product_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        serviceId
          ? supabase
              .from("marketplace_services")
              .select("id, name, price, duration_days, revision_limit")
              .eq("id", serviceId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("profiles").select("full_name, email").eq("id", inquiry.user_id).maybeSingle(),
        storeId
          ? supabase
              .from("stores")
              .select("id, name, slug, logo_url, is_platform")
              .eq("id", storeId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const hasMore = (rawMessages.data?.length ?? 0) > MESSAGE_PAGE_SIZE;
    const windowDesc = (rawMessages.data ?? []).slice(0, MESSAGE_PAGE_SIZE);
    const messages = [...windowDesc].reverse();
    const oldest = messages[0]?.created_at ?? null;

    // Jika ada pesan yang membalas pesan di luar jendela 50 terbaru, ambil ringkasannya.
    const presentIds = new Set(messages.map((m: any) => m.id));
    const missingReplyIds = Array.from(
      new Set(
        messages
          .map((m: any) => m.reply_to_id)
          .filter((rid: unknown): rid is string => typeof rid === "string" && !presentIds.has(rid)),
      ),
    );
    const replyTargets: Record<string, any> = {};
    if (missingReplyIds.length) {
      const { data: refs } = await supabase
        .from("product_inquiry_messages")
        .select("id, sender_id, sender_role, body, attachment, deleted_at")
        .eq("inquiry_id", data.id)
        .in("id", missingReplyIds);
      for (const ref of refs ?? []) replyTargets[ref.id] = ref;
    }

    return {
      inquiry,
      messages,
      replyTargets,
      hasMore,
      oldest,
      product: productResult.data ?? null,
      service: serviceResult.data ?? null,
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
    const load = async (fields: string) =>
      supabase
        .from("product_inquiry_messages")
        .select(fields)
        .eq("inquiry_id", data.id)
        .lt("created_at", data.before)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE + 1);
    let res = await load(MESSAGE_FIELDS_RICH);
    if (res.error && isMissingColumnError(res.error)) {
      res = await load(MESSAGE_FIELDS_BASE);
    }
    const raw = res.data;
    const hasMore = (raw?.length ?? 0) > MESSAGE_PAGE_SIZE;
    const windowDesc = (raw ?? []).slice(0, MESSAGE_PAGE_SIZE);
    const messages = [...windowDesc].reverse();
    return { messages, hasMore, oldest: messages[0]?.created_at ?? null };
  });

// ---------------------------------------------------------------------------
// Lampiran chat (foto, album, dokumen, lokasi, voice note, kartu katalog).
// Bucket privat `chat-attachments`; path selalu diawali id thread.
// ---------------------------------------------------------------------------

const CHAT_BUCKET = "chat-attachments";
const CHAT_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_AUDIO_MAX_BYTES = 5 * 1024 * 1024;

const CHAT_AUDIO_MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
};

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
  ...CHAT_AUDIO_MIME_EXT,
};

const fileEntrySchema = z.object({
  path: z.string().min(10).max(300),
  name: z.string().trim().min(1).max(160),
  mime: z.string().max(120),
  size: z.number().int().min(1).max(CHAT_MAX_BYTES),
});

const attachmentSchema = z.discriminatedUnion("kind", [
  fileEntrySchema.extend({ kind: z.enum(["image", "file"]) }),
  z.object({
    kind: z.literal("gallery"),
    items: z.array(fileEntrySchema).min(2).max(4),
  }),
  z.object({
    kind: z.literal("audio"),
    path: z.string().min(10).max(300),
    name: z.string().trim().min(1).max(160),
    mime: z.string().max(120),
    size: z.number().int().min(1).max(CHAT_AUDIO_MAX_BYTES),
    durationSec: z.number().int().min(1).max(300),
    waveform: z.array(z.number().int().min(0).max(100)).max(40).optional(),
  }),
  z.object({
    kind: z.literal("location"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  z.object({
    kind: z.literal("product"),
    productId: z.string().uuid(),
    slug: z.string().max(160).optional(),
    name: z.string().max(200).optional(),
    price: z.number().optional(),
    discountPrice: z.number().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    storeName: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("service"),
    serviceId: z.string().uuid(),
    name: z.string().max(200).optional(),
    price: z.number().optional(),
    durationDays: z.number().optional(),
    revisionLimit: z.number().optional(),
    storeName: z.string().nullable().optional(),
  }),
]);

export type ChatAttachment = z.infer<typeof attachmentSchema>;

function hasValidAttachmentPaths(inquiryId: string, att?: ChatAttachment): boolean {
  if (!att) return true;
  if (att.kind === "location" || att.kind === "product" || att.kind === "service") return true;
  if (att.kind === "gallery") {
    return att.items.every((item) => item.path.startsWith(`${inquiryId}/`));
  }
  return att.path.startsWith(`${inquiryId}/`);
}

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
        mimeType: z.string().max(160),
        sizeBytes: z.number().int().min(1).max(CHAT_MAX_BYTES),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const normalizedMime = normalizeChatMime(data.mimeType);
    const ext = CHAT_MIME_EXT[normalizedMime];
    if (!ext) return { ok: false as const, error: "Jenis file ini tidak didukung." };
    const isAudio = Boolean(CHAT_AUDIO_MIME_EXT[normalizedMime]);
    if (isAudio && data.sizeBytes > CHAT_AUDIO_MAX_BYTES) {
      return { ok: false as const, error: "Ukuran pesan suara maksimal 5 MB." };
    }
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
    return {
      ok: true as const,
      bucket: CHAT_BUCKET,
      path,
      token: signed.token as string,
      mimeType: normalizedMime,
    };
  });

/** Signed URL baca (1 jam) untuk lampiran di satu thread yang boleh diakses pemanggil. */
export const getChatAttachmentUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ inquiryId: z.string().uuid(), paths: z.array(z.string().max(300)).max(120) })
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
        replyToId: z.string().uuid().nullable().optional(),
      })
      .refine((d) => d.body.length > 0 || d.attachment, "Pesan kosong.")
      .refine((d) => hasValidAttachmentPaths(d.inquiryId, d.attachment), "Lampiran tidak valid.")
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

    // Validasi reply_to_id milik thread yang sama (cegah cross-thread quote).
    let validReplyToId: string | null = null;
    if (data.replyToId) {
      const { data: targetMsg } = await supabase
        .from("product_inquiry_messages")
        .select("id")
        .eq("id", data.replyToId)
        .eq("inquiry_id", data.inquiryId)
        .maybeSingle();
      if (!targetMsg) {
        return { ok: false as const, error: "Pesan yang dibalas tidak ditemukan." };
      }
      validReplyToId = targetMsg.id as string;
    }

    // Kartu produk/jasa: selalu baca harga & metadata otoritatif dari server,
    // tidak pernah mempercayai harga atau nama dari browser.
    let resolvedAttachment: ChatAttachment | null = data.attachment ?? null;
    if (resolvedAttachment?.kind === "product") {
      const { data: prod } = await supabase
        .from("digital_products")
        .select("id, name, slug, price, discount_price, thumbnail_url, stores(name)")
        .eq("id", resolvedAttachment.productId)
        .eq("status", "published")
        .is("deleted_at", null)
        .maybeSingle();
      if (!prod) return { ok: false as const, error: "Produk tidak ditemukan atau tidak aktif." };
      const pd = priceDetails(prod.price, prod.discount_price);
      resolvedAttachment = {
        kind: "product",
        productId: prod.id,
        slug: prod.slug,
        name: prod.name,
        price: pd.basePrice,
        discountPrice: pd.hasDiscount ? pd.price : null,
        thumbnailUrl: prod.thumbnail_url ?? null,
        storeName: (prod.stores as any)?.name ?? null,
      };
    } else if (resolvedAttachment?.kind === "service") {
      const { data: svc } = await supabase
        .from("marketplace_services")
        .select("id, name, price, duration_days, revision_limit, stores(name)")
        .eq("id", resolvedAttachment.serviceId)
        .eq("status", "active")
        .eq("moderation_status", "approved")
        .maybeSingle();
      if (!svc) return { ok: false as const, error: "Jasa tidak ditemukan atau belum tayang." };
      resolvedAttachment = {
        kind: "service",
        serviceId: svc.id,
        name: svc.name,
        price: Number(svc.price),
        durationDays: Number(svc.duration_days ?? 1),
        revisionLimit: Number(svc.revision_limit ?? 0),
        storeName: (svc.stores as any)?.name ?? null,
      };
    }

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

    const payload: Record<string, unknown> = {
      inquiry_id: data.inquiryId,
      sender_id: userId,
      sender_role: senderRole,
      body: data.body,
      attachment: resolvedAttachment,
      ...(validReplyToId ? { reply_to_id: validReplyToId } : {}),
    };

    let { error } = await supabase.from("product_inquiry_messages").insert(payload);
    // Fallback kompatibilitas mundur jika kolom reply_to_id belum dimigrasi.
    if (error && validReplyToId && isMissingColumnError(error)) {
      const { reply_to_id: _drop, ...fallbackPayload } = payload;
      const retry = await supabase.from("product_inquiry_messages").insert(fallbackPayload);
      error = retry.error;
    }
    if (error) {
      const code = String(error.code ?? "");
      if (code === "23514" && resolvedAttachment) {
        return {
          ok: false as const,
          error:
            "Fitur lampiran baru ini memerlukan pembaruan skema database chat (migrasi 20261125123000).",
        };
      }
      return { ok: false as const, error: "Pesan gagal dikirim. Coba lagi." };
    }

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

/** Toggle reaksi emoji pada satu pesan (otorisasi peserta di RPC DB). */
export const toggleInquiryReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        messageId: z.string().uuid(),
        emoji: z.enum(CHAT_REACTION_EMOJIS),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: reactions, error } = await (context as Ctx).supabase.rpc(
      "toggle_inquiry_message_reaction",
      { _message_id: data.messageId, _emoji: data.emoji },
    );
    if (error) {
      return {
        ok: false as const,
        error: "Reaksi belum dapat disimpan. Pastikan migrasi chat terbaru sudah diterapkan.",
      };
    }
    return { ok: true as const, reactions: (reactions ?? {}) as Record<string, string[]> };
  });

/** Edit pesan milik sendiri dalam batas 15 menit (simpan original_body untuk audit). */
export const editInquiryMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        messageId: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("edit_inquiry_message", {
      _message_id: data.messageId,
      _body: data.body,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("EDIT_WINDOW_EXPIRED")) {
        return { ok: false as const, error: "Batas waktu edit pesan (15 menit) sudah lewat." };
      }
      if (msg.includes("FORBIDDEN")) {
        return { ok: false as const, error: "Hanya pengirim asli yang bisa mengedit pesan ini." };
      }
      return { ok: false as const, error: "Pesan gagal diubah." };
    }
    return { ok: true as const };
  });

/** Soft-delete pesan (simpan jejak audit di server, tampilkan "Pesan ini dihapus"). */
export const softDeleteInquiryMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ messageId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("soft_delete_inquiry_message", {
      _message_id: data.messageId,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("FORBIDDEN")) {
        return { ok: false as const, error: "Anda tidak berwenang menghapus pesan ini." };
      }
      return { ok: false as const, error: "Pesan gagal dihapus." };
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

/** Tandai thread sebagai belum dibaca agar mudah ditindaklanjuti nanti. */
export const markInquiryUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ inquiryId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("mark_inquiry_unread", {
      _inquiry_id: data.inquiryId,
    });
    if (error) return { ok: false as const, error: "Gagal menandai belum dibaca." };
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

/** Cari produk & jasa aktif untuk dibagikan sebagai kartu katalog di dalam chat. */
export const searchShareableCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid().nullable().optional(),
        q: z.string().trim().max(80).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let prodQ = supabase
      .from("digital_products")
      .select("id, name, slug, price, discount_price, thumbnail_url, stores(name)")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    if (data.storeId) prodQ = prodQ.eq("store_id", data.storeId);
    if (data.q) prodQ = prodQ.ilike("name", `%${data.q}%`);

    let svcQ = supabase
      .from("marketplace_services")
      .select("id, name, price, duration_days, revision_limit, stores(name)")
      .eq("status", "active")
      .eq("moderation_status", "approved")
      .order("created_at", { ascending: false })
      .limit(8);
    if (data.storeId) svcQ = svcQ.eq("store_id", data.storeId);
    if (data.q) svcQ = svcQ.ilike("name", `%${data.q}%`);

    const [prods, svcs] = await Promise.all([prodQ, svcQ]);
    return {
      products: (prods.data ?? []).map((p: any) => {
        const pd = priceDetails(p.price, p.discount_price);
        return {
          productId: p.id as string,
          slug: p.slug as string,
          name: p.name as string,
          price: pd.basePrice,
          discountPrice: pd.hasDiscount ? pd.price : null,
          thumbnailUrl: (p.thumbnail_url as string | null) ?? null,
          storeName: (p.stores?.name as string | null) ?? null,
        };
      }),
      services: (svcs.data ?? []).map((s: any) => ({
        serviceId: s.id as string,
        name: s.name as string,
        price: Number(s.price),
        durationDays: Number(s.duration_days ?? 1),
        revisionLimit: Number(s.revision_limit ?? 0),
        storeName: (s.stores?.name as string | null) ?? null,
      })),
    };
  });

export const setInquiryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ inquiryId: z.string().uuid(), status: z.enum(["open", "answered", "closed"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { supabase, userId } = ctx;
    const { data: inquiry } = await supabase
      .from("product_inquiries")
      .select("id, user_id, store_id")
      .eq("id", data.inquiryId)
      .maybeSingle();

    if (!inquiry) {
      const { recordSecurityEvent } = await import("./security-event.server");
      await recordSecurityEvent({
        eventType: "ownership_violation_attempt",
        severity: "MEDIUM",
        category: "access_denial",
        actorUserId: userId,
        endpoint: "serverFn:inquiries:setInquiryStatus",
        actionName: "setInquiryStatus",
        targetResourceType: "product_inquiries",
        targetResourceId: data.inquiryId,
        statusCode: 403,
        reasonCode: "INQUIRY_ACCESS_DENIED",
        sourceSystem: "server_fn",
      });
      return { ok: false as const, error: "Percakapan tidak ditemukan atau akses ditolak." };
    }

    const isOwner = inquiry.user_id === userId;
    const myStoreId = isOwner ? null : ((await supabase.rpc("my_store_id")).data as string | null);
    const isSeller = Boolean(!isOwner && inquiry.store_id && myStoreId && inquiry.store_id === myStoreId);
    let isAuthorized = isOwner || isSeller;
    if (!isAuthorized) {
      const { loadAccess } = await import("./authz.server");
      const access = await loadAccess(ctx);
      isAuthorized = access.isSuperAdmin || access.permissions.includes("orders.view");
    }

    if (!isAuthorized) {
      const { recordSecurityEvent } = await import("./security-event.server");
      await recordSecurityEvent({
        eventType: "ownership_violation_attempt",
        severity: "HIGH",
        category: "security_violation",
        actorUserId: userId,
        endpoint: "serverFn:inquiries:setInquiryStatus",
        actionName: "setInquiryStatus",
        targetResourceType: "product_inquiries",
        targetResourceId: data.inquiryId,
        statusCode: 403,
        reasonCode: "INQUIRY_OWNERSHIP_VIOLATION",
        sourceSystem: "server_fn",
      });
      return { ok: false as const, error: "Akses ditolak." };
    }

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
      .select(FIELDS)
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
