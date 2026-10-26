import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");

type Ctx = { supabase: any; userId: string };

const BUCKET = "product-files";
const DEFAULT_MAX_MB = 100;

async function guard<T>(
  context: Ctx,
  permission: string,
  run: (helpers: Awaited<ReturnType<typeof authz>>) => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run(helpers);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function maxUploadBytes(supabase: any): Promise<number> {
  const { data } = await supabase
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

/** Daftar berkas master sebuah produk (histori versi). */
export const listProductFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.view", async () => {
      const sb = await admin();
      const { data: product } = await sb
        .from("digital_products")
        .select("delivery_mode, available_stock")
        .eq("id", data.productId)
        .maybeSingle();
      const { data: rows, error } = await sb
        .from("digital_product_files")
        .select(
          "id, storage_path, original_name, mime_type, size_bytes, version, is_active, created_at, assigned_entitlement_id, assigned_at",
        )
        .eq("product_id", data.productId)
        .order("created_at", { ascending: false });
      const meta = {
        deliveryMode: (product?.delivery_mode ?? "shared") as "shared" | "unique",
        availableStock: Number(product?.available_stock ?? 0),
      };
      if (error)
        return {
          forbidden: false as const,
          items: [],
          ...meta,
          error: "Berkas produk tidak dapat dimuat.",
        };
      return {
        forbidden: false as const,
        items: rows ?? [],
        ...meta,
        error: null as string | null,
      };
    }),
  );

/** Mengubah mode pengiriman produk digital: berkas bersama atau stok unik per pembeli. */
export const setProductDeliveryMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ productId: z.string().uuid(), mode: z.enum(["shared", "unique"]) }).parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.update", async (helpers) => {
      const sb = await admin();
      const { error } = await sb
        .from("digital_products")
        .update({ delivery_mode: data.mode })
        .eq("id", data.productId);
      if (error) return { ok: false as const, message: "Gagal mengubah mode pengiriman." };

      // Catatan: saat beralih ke mode unik, berkas yang sebelumnya dinonaktifkan
      // sengaja TIDAK diaktifkan ulang agar versi lama tidak ikut terjual.
      // Admin dapat mengaktifkan berkas lama secara manual dari dialog berkas.
      await helpers.writeAudit(context as Ctx, {
        action: "product.delivery_mode",
        entityType: "digital_product",
        entityId: data.productId,
        after: { delivery_mode: data.mode },
      });
      return {
        ok: true as const,
        message:
          data.mode === "unique"
            ? "Mode stok unik aktif. Berkas nonaktif tidak ikut dijual — aktifkan manual bila ingin dijadikan stok."
            : "Mode berkas bersama aktif.",
      };
    }),
  );

/** Membuat signed upload URL ke bucket privat product-files. */
export const createProductFileUpload = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.update", async () => {
      const sb = await admin();
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
        console.error("[product-files] gagal membuat signed upload:", error?.message);
        return { ok: false as const, message: "Gagal menyiapkan unggahan. Coba lagi." };
      }
      return { ok: true as const, path, token: signed.token, bucket: BUCKET };
    }),
  );

/** Mencatat berkas yang sudah terunggah sebagai versi produk. */
export const registerProductFile = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.update", async (helpers) => {
      const sb = await admin();
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

      const { data: inserted, error } = await sb
        .from("digital_product_files")
        .insert({
          product_id: data.productId,
          storage_path: data.path,
          original_name: data.originalName,
          mime_type: actualMime || data.mimeType || null,
          size_bytes: actualSize,
          version: data.version,
          is_active: unique ? true : data.makeActive,
        })
        .select("id")
        .single();

      if (error) {
        console.error("[product-files] gagal menyimpan berkas:", error.message);
        return { ok: false as const, message: "Gagal menyimpan berkas produk." };
      }

      if (data.makeActive && !unique) {
        await sb
          .from("digital_products")
          .update({ version: data.version })
          .eq("id", data.productId);
      }

      await helpers.writeAudit(context as Ctx, {
        action: "product_file.upload",
        entityType: "digital_product",
        entityId: data.productId,
        after: { file_id: inserted?.id, version: data.version, size_bytes: data.sizeBytes },
      });

      return {
        ok: true as const,
        message: unique
          ? `Berkas ${data.originalName} ditambahkan ke stok.`
          : `Versi ${data.version} tersimpan.`,
      };
    }),
  );

/** Mengaktifkan atau menonaktifkan versi berkas. */
export const setProductFileActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ fileId: z.string().uuid(), isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.update", async (helpers) => {
      const sb = await admin();
      const { data: file } = await sb
        .from("digital_product_files")
        .select("id, product_id, version, assigned_entitlement_id")
        .eq("id", data.fileId)
        .maybeSingle();
      if (!file) return { ok: false as const, message: "Berkas tidak ditemukan." };
      if (file.assigned_entitlement_id) {
        return {
          ok: false as const,
          message: "Berkas ini sudah terkunci untuk pembeli dan tidak dapat diubah.",
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
        await sb
          .from("digital_products")
          .update({ version: file.version })
          .eq("id", file.product_id);
      }
      const { error } = await sb
        .from("digital_product_files")
        .update({ is_active: data.isActive })
        .eq("id", data.fileId);
      if (error) return { ok: false as const, message: "Gagal memperbarui status berkas." };

      await helpers.writeAudit(context as Ctx, {
        action: data.isActive ? "product_file.activate" : "product_file.deactivate",
        entityType: "digital_product",
        entityId: file.product_id,
        after: { file_id: data.fileId },
      });
      return {
        ok: true as const,
        message: data.isActive ? "Versi diaktifkan." : "Versi dinonaktifkan.",
      };
    }),
  );

/** Menghapus versi berkas beserta objek storage-nya. */
export const deleteProductFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ fileId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.delete", async (helpers) => {
      const sb = await admin();
      const { data: file } = await sb
        .from("digital_product_files")
        .select("id, product_id, storage_path, assigned_entitlement_id")
        .eq("id", data.fileId)
        .maybeSingle();
      if (!file) return { ok: false as const, message: "Berkas tidak ditemukan." };
      if (file.assigned_entitlement_id) {
        return {
          ok: false as const,
          message: "Berkas sudah dimiliki pembeli dan tidak dapat dihapus.",
        };
      }

      await sb.storage.from(BUCKET).remove([file.storage_path]);
      const { error } = await sb.from("digital_product_files").delete().eq("id", data.fileId);
      if (error) return { ok: false as const, message: "Gagal menghapus berkas." };

      await helpers.writeAudit(context as Ctx, {
        action: "product_file.delete",
        entityType: "digital_product",
        entityId: file.product_id,
        after: { file_id: data.fileId, storage_path: file.storage_path },
      });
      return { ok: true as const, message: "Berkas dihapus." };
    }),
  );

/** Histori unduhan milik customer yang sedang login. */
export const listMyDownloadLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase
      .from("download_logs")
      .select("id, entitlement_id, downloaded_at")
      .order("downloaded_at", { ascending: false })
      .limit(50);
    if (error) return { items: [], error: "Histori unduhan tidak dapat dimuat." as const };
    return { items: data ?? [], error: null };
  });
