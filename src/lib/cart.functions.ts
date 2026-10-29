import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Validasi isi keranjang terhadap kondisi server saat ini.
 *
 * Keranjang di browser hanya menyimpan id/slug dan harga "petunjuk". Fungsi ini
 * yang menentukan harga sebenarnya, ketersediaan, dan status toko. Semua angka
 * yang ditampilkan di halaman keranjang berasal dari sini, bukan dari localStorage.
 */
const cartLine = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
});

type VariantRow = { id: string; name: string; price: number; discount_price: number | null };

function resolvePrice(price: unknown, discount: unknown) {
  const basePrice = Number(price);
  const discountPrice = Number(discount);
  const hasDiscount =
    discount != null &&
    Number.isFinite(discountPrice) &&
    discountPrice > 0 &&
    discountPrice < basePrice;
  return { price: hasDiscount ? discountPrice : basePrice, basePrice, hasDiscount };
}

export const validateCartItems = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ items: z.array(cartLine).max(50) }).parse(data ?? { items: [] }),
  )
  .handler(async ({ data }) => {
    if (data.items.length === 0) return { items: [], error: null };

    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();

    const productIds = [...new Set(data.items.map((it) => it.productId))];
    const { data: rows, error } = await supabase
      .from("digital_products")
      .select(
        "id, name, slug, thumbnail_url, price, discount_price, status, deleted_at, delivery_mode, store_id, stores(id, name, slug, status), product_variants(id, name, price, discount_price)",
      )
      .in("id", productIds);

    if (error) {
      console.error("[cart] validasi gagal:", error.message);
      return { items: [], error: "Keranjang tidak dapat diperiksa. Coba lagi." as const };
    }

    const found = new Map((rows ?? []).map((row: any) => [row.id, row]));

    const items = data.items.map(({ productId, variantId }) => {
      const variantKey = variantId ?? null;
      const row: any = found.get(productId);
      if (!row) {
        return { productId, variantId: variantKey, available: false, reason: "PRODUCT_GONE" as const };
      }

      const store = row.stores as { id: string; name: string; slug: string; status: string } | null;
      // RLS publik hanya mengembalikan variasi aktif.
      const variants: VariantRow[] =
        (row.delivery_mode ?? "shared") === "shared" ? (row.product_variants ?? []) : [];
      const variant = variantKey ? variants.find((v) => v.id === variantKey) : undefined;

      const unavailableReason =
        row.deleted_at !== null
          ? ("PRODUCT_GONE" as const)
          : row.status !== "published"
            ? ("NOT_PUBLISHED" as const)
            : store && store.status !== "active"
              ? ("STORE_INACTIVE" as const)
              : variantKey && !variant
                ? ("VARIANT_GONE" as const)
                : !variantKey && variants.length > 0
                  ? ("VARIANT_REQUIRED" as const)
                  : null;

      const pricing = variant
        ? resolvePrice(variant.price, variant.discount_price)
        : resolvePrice(row.price, row.discount_price);

      return {
        productId: row.id as string,
        variantId: variant?.id ?? variantKey,
        variantName: variant?.name ?? null,
        name: row.name as string,
        slug: row.slug as string,
        thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
        storeId: store?.id ?? null,
        storeName: store?.name ?? null,
        storeSlug: store?.slug ?? null,
        ...pricing,
        available: unavailableReason === null,
        reason: unavailableReason,
      };
    });

    return { items, error: null };
  });
