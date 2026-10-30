import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";

type Ctx = { supabase: any; userId: string };

const BUCKET = "product-files";
const DEFAULT_MAX_MB = 100;

function rpcError(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  const map: Record<string, string> = {
    FORBIDDEN: "Anda tidak punya izin untuk aksi ini.",
    MODE_NOT_CODE: "Produk ini bukan mode kode. Ubah delivery mode terlebih dahulu.",
    TOO_MANY_CODES: "Maksimal 500 kode per batch.",
    NOT_FOUND: "Data tidak ditemukan.",
  };
  return map[clean] ?? (clean.length > 3 ? clean : "Aksi gagal diproses. Coba lagi.");
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function maxUploadBytes(sb: any): Promise<number> {
  const { data } = await sb
    .from("system_settings")
    .select("value")
    .eq("key", "product_file_max_mb")
    .maybeSingle();
  const mb = Number(data?.value ?? DEFAULT_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB) * 1024 * 1024;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

async function verifyOwnership(sb: any, productId: string, userId: string): Promise<string | null> {
  const { data } = await sb
    .from("digital_products")
    .select("store_id, stores!inner(owner_id)")
    .eq("id", productId)
    .maybeSingle();
  if (!data) return null;
  const owner = (data as any).stores?.owner_id;
  if (owner !== userId) return null;
  return data.store_id;
}

/* ---------- Daftar file produk seller ---------- */

export const listMyProductFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = await adminClient();
    const storeId = await verifyOwnership(sb, data.productId, (context as Ctx).userId);
    if (!storeId)
      return {
        forbidden: true as const,
        items: [],
        deliveryMode: "shared" as const,
        availableStock: 0,
      };

    const { data: product } = await sb
      .from("digital_products")
      .select("delivery_mode, code_kind, available_stock")
      .eq("id", data.productId)
      .maybeSingle();

    const { data: rows } = await sb
      .from("digital_product_files")
      .select(
        "id, storage_path, original_name, mime_type, size_bytes, version, is_active, created_at, assigned_entitlement_id, assigned_at",
      )
      .eq("product_id", data.productId)
      .order("created_at", { ascending: false });

    return {
      forbidden: false as const,
      items: rows ?? [],
      deliveryMode: (product?.delivery_mode === "code" && product?.code_kind === "account"
        ? "account"
        : (product?.delivery_mode ?? "shared")) as "shared" | "unique" | "code" | "account",
      availableStock: Number(product?.available_stock ?? 0),
    };
  });

/* ---------- Signed upload URL ---------- */

export const createMyFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        filename: z.string().min(1).max(180),
        sizeBytes: z.number().int().positive(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "seller.product");
    if (limited) return { ok: false as const, message: limited.error };

    const sb = await adminClient();
    const storeId = await verifyOwnership(sb, data.productId, (context as Ctx).userId);
    if (!storeId) return { ok: false as const, message: "Produk bukan milik toko Anda." };

    const limit = await maxUploadBytes(sb);
    if (data.sizeBytes > limit) {
      return {
        ok: false as const,
        message: `Ukuran berkas melebihi batas ${Math.round(limit / 1024 / 1024)} MB.`,
      };
    }

    const path = `${data.productId}/${Date.now()}-${safeName(data.filename)}`;
    const { data: signed, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) {
      console.error("[seller-files] gagal membuat signed upload:", error?.message);
      return { ok: false as const, message: "Gagal menyiapkan unggahan. Coba lagi." };
    }
    return { ok: true as const, path, token: signed.token, bucket: BUCKET };
  });

/* ---------- Register file setelah upload ---------- */

export const registerMyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        path: z.string().min(3).max(400),
        originalName: z.string().min(1).max(180),
        mimeType: z.string().max(120).nullable().optional(),
        sizeBytes: z.number().int().nonnegative(),
        version: z.string().min(1).max(40),
        makeActive: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = await adminClient();
    const storeId = await verifyOwnership(sb, data.productId, (context as Ctx).userId);
    if (!storeId) return { ok: false as const, message: "Produk bukan milik toko Anda." };

    if (!data.path.startsWith(`${data.productId}/`)) {
      return { ok: false as const, message: "Jalur berkas tidak valid." };
    }
    const { data: objects } = await sb.storage
      .from(BUCKET)
      .list(data.productId, { search: data.path.split("/").slice(1).join("/") });
    if (!objects || objects.length === 0) {
      return { ok: false as const, message: "Berkas belum terunggah sepenuhnya." };
    }
    // Metadata dari klien adalah klaim; ukuran dan tipe sebenarnya dibaca dari objek.
    const fileName = data.path.split("/").pop() ?? "";
    const object = objects.find((entry) => entry.name === fileName);
    const actualSize = Number((object?.metadata as { size?: number } | null)?.size ?? 0);
    const actualMime = String((object?.metadata as { mimetype?: string } | null)?.mimetype ?? "");
    if (actualSize < 1) {
      return { ok: false as const, message: "Ukuran berkas tidak dapat dibaca. Unggah ulang." };
    }
    if (data.sizeBytes !== actualSize) {
      return {
        ok: false as const,
        message: "Ukuran berkas tidak cocok dengan berkas yang diunggah.",
      };
    }

    const { data: product } = await sb
      .from("digital_products")
      .select("delivery_mode")
      .eq("id", data.productId)
      .maybeSingle();
    const unique = (product?.delivery_mode ?? "shared") === "unique";

    if (data.makeActive && !unique) {
      await sb
        .from("digital_product_files")
        .update({ is_active: false })
        .eq("product_id", data.productId);
    }

    const { error } = await sb.from("digital_product_files").insert({
      product_id: data.productId,
      storage_path: data.path,
      original_name: data.originalName,
      mime_type: actualMime || data.mimeType || null,
      size_bytes: actualSize,
      version: data.version,
      is_active: unique ? true : data.makeActive,
    });

    if (error) {
      console.error("[seller-files] gagal menyimpan berkas:", error.message);
      return { ok: false as const, message: "Gagal menyimpan berkas produk." };
    }

    if (data.makeActive && !unique) {
      await sb.from("digital_products").update({ version: data.version }).eq("id", data.productId);
    }

    return {
      ok: true as const,
      message: unique
        ? `Berkas ${data.originalName} ditambahkan ke stok.`
        : `Versi ${data.version} tersimpan. Status moderasi akan direset.`,
    };
  });

/* ---------- Toggle aktif/nonaktif file ---------- */

export const setMyFileActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ fileId: z.string().uuid(), isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = await adminClient();
    const { data: file } = await sb
      .from("digital_product_files")
      .select("id, product_id, version, assigned_entitlement_id")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file) return { ok: false as const, message: "Berkas tidak ditemukan." };

    const storeId = await verifyOwnership(sb, file.product_id, (context as Ctx).userId);
    if (!storeId) return { ok: false as const, message: "Produk bukan milik toko Anda." };

    if (file.assigned_entitlement_id) {
      return {
        ok: false as const,
        message: "Berkas sudah terkunci untuk pembeli dan tidak dapat diubah.",
      };
    }

    const { data: product } = await sb
      .from("digital_products")
      .select("delivery_mode")
      .eq("id", file.product_id)
      .maybeSingle();
    const unique = (product?.delivery_mode ?? "shared") === "unique";

    if (data.isActive && !unique) {
      await sb
        .from("digital_product_files")
        .update({ is_active: false })
        .eq("product_id", file.product_id);
      await sb.from("digital_products").update({ version: file.version }).eq("id", file.product_id);
    }
    const { error } = await sb
      .from("digital_product_files")
      .update({ is_active: data.isActive })
      .eq("id", data.fileId);
    if (error) return { ok: false as const, message: "Gagal memperbarui status berkas." };

    return {
      ok: true as const,
      message: data.isActive ? "Versi diaktifkan." : "Versi dinonaktifkan.",
    };
  });

/* ---------- Hapus file ---------- */

export const deleteMyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ fileId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = await adminClient();
    const { data: file } = await sb
      .from("digital_product_files")
      .select("id, product_id, storage_path, assigned_entitlement_id")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file) return { ok: false as const, message: "Berkas tidak ditemukan." };

    const storeId = await verifyOwnership(sb, file.product_id, (context as Ctx).userId);
    if (!storeId) return { ok: false as const, message: "Produk bukan milik toko Anda." };

    if (file.assigned_entitlement_id) {
      return {
        ok: false as const,
        message: "Berkas sudah dimiliki pembeli dan tidak dapat dihapus.",
      };
    }

    await sb.storage.from(BUCKET).remove([file.storage_path]);
    const { error } = await sb.from("digital_product_files").delete().eq("id", data.fileId);
    if (error) return { ok: false as const, message: "Gagal menghapus berkas." };

    return { ok: true as const, message: "Berkas dihapus." };
  });

/* ---------- Ubah delivery mode ---------- */

export const setMyDeliveryMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        mode: z.enum(["shared", "unique", "code", "account"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = await adminClient();
    const storeId = await verifyOwnership(sb, data.productId, (context as Ctx).userId);
    if (!storeId) return { ok: false as const, message: "Produk bukan milik toko Anda." };

    // Akun memakai jalur stok kode; jenisnya dibedakan lewat code_kind.
    const isAccount = data.mode === "account";
    const { error } = await sb
      .from("digital_products")
      .update({
        delivery_mode: isAccount ? "code" : data.mode,
        code_kind: isAccount ? "account" : "code",
      })
      .eq("id", data.productId);
    if (error) return { ok: false as const, message: "Gagal mengubah mode pengiriman." };

    const labels: Record<string, string> = {
      shared: "Mode berkas bersama aktif.",
      unique: "Mode stok unik aktif. Berkas nonaktif tidak ikut dijual.",
      code: "Mode kode/link aktif. Tambahkan kode stok di bawah.",
      account: "Mode akun aktif. Tambahkan stok akun di bawah.",
    };
    return { ok: true as const, message: labels[data.mode] };
  });

/* ---------- Ingest stock codes (seller paste) ---------- */

export const ingestMyStockCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        codes: z.array(z.string().min(1).max(500)).min(1).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "seller.product");
    if (limited) return { ok: false as const, message: limited.error };

    const sb = (context as Ctx).supabase;
    const { data: result, error } = await sb.rpc("seller_ingest_stock_codes", {
      _product_id: data.productId,
      _codes: data.codes,
    });
    if (error) return { ok: false as const, message: rpcError(error.message) };

    const r = result as { inserted: number; skipped: number };
    return {
      ok: true as const,
      message: `${r.inserted} kode ditambahkan${r.skipped > 0 ? `, ${r.skipped} duplikat dilewati` : ""}.`,
      inserted: r.inserted,
      skipped: r.skipped,
    };
  });

/* ---------- List stock codes seller ---------- */

export const listMyStockCodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        status: z.enum(["available", "assigned", "expired", "void"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = await adminClient();
    const storeId = await verifyOwnership(sb, data.productId, (context as Ctx).userId);
    if (!storeId) return { forbidden: true as const, items: [] };

    let query = sb
      .from("product_stock_codes")
      .select("id, code, status, source, assigned_at, expires_at, created_at")
      .eq("product_id", data.productId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.status) query = query.eq("status", data.status);
    const { data: rows } = await query;
    return { forbidden: false as const, items: rows ?? [] };
  });
