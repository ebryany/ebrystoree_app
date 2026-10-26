import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Validasi isi keranjang terhadap kondisi server saat ini.
 *
 * Keranjang di browser hanya menyimpan id/slug dan harga "petunjuk". Fungsi ini
 * yang menentukan harga sebenarnya, ketersediaan, dan status toko. Semua angka
 * yang ditampilkan di halaman keranjang berasal dari sini, bukan dari localStorage.
 */
export const validateCartItems = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ productIds: z.array(z.string().uuid()).max(50) }).parse(data ?? { productIds: [] }),
  )
  .handler(async ({ data }) => {
    if (data.productIds.length === 0) return { items: [], error: null };

    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();

    const { data: rows, error } = await supabase
      .from("digital_products")
      .select(
        "id, name, slug, thumbnail_url, price, discount_price, status, deleted_at, store_id, stores(id, name, slug, status)",
      )
      .in("id", data.productIds);

    if (error) {
      console.error("[cart] validasi gagal:", error.message);
      return { items: [], error: "Keranjang tidak dapat diperiksa. Coba lagi." as const };
    }

    const found = new Map((rows ?? []).map((row: any) => [row.id, row]));

    const items = data.productIds.map((id) => {
      const row: any = found.get(id);
      if (!row) {
        return { productId: id, available: false, reason: "PRODUCT_GONE" as const };
      }

      const store = row.stores as { id: string; name: string; slug: string; status: string } | null;
      const basePrice = Number(row.price);
      const discountPrice = Number(row.discount_price);
      const hasDiscount =
        row.discount_price != null &&
        Number.isFinite(discountPrice) &&
        discountPrice > 0 &&
        discountPrice < basePrice;

      const unavailableReason =
        row.deleted_at !== null
          ? ("PRODUCT_GONE" as const)
          : row.status !== "published"
            ? ("NOT_PUBLISHED" as const)
            : store && store.status !== "active"
              ? ("STORE_INACTIVE" as const)
              : null;

      return {
        productId: row.id,
        name: row.name as string,
        slug: row.slug as string,
        thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
        storeId: store?.id ?? null,
        storeName: store?.name ?? null,
        storeSlug: store?.slug ?? null,
        price: hasDiscount ? discountPrice : basePrice,
        basePrice,
        hasDiscount,
        available: unavailableReason === null,
        reason: unavailableReason,
      };
    });

    return { items, error: null };
  });
