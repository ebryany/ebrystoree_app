import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

export type EditableVariant = {
  id?: string;
  name: string;
  price: number;
  discount_price: number | null;
  is_active: boolean;
};

/**
 * Daftar variasi untuk editor (seller pemilik / admin). RLS `variants_select_manage`
 * yang membatasi: seller lain atau pembeli tidak melihat variasi nonaktif.
 */
export const listProductVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context as Ctx).supabase
      .from("product_variants")
      .select("id, name, price, discount_price, is_active, sort_order")
      .eq("product_id", data.productId)
      .order("sort_order", { ascending: true });
    if (error) return { items: [] as EditableVariant[], error: "Variasi tidak dapat dimuat." };
    return {
      items: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        price: Number(r.price),
        discount_price: r.discount_price == null ? null : Number(r.discount_price),
        is_active: Boolean(r.is_active),
      })),
      error: null,
    };
  });

const variantInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Nama variasi wajib diisi").max(60),
    price: z.number().int().min(0).max(1_000_000_000),
    discount_price: z.number().int().min(0).max(1_000_000_000).nullable(),
    is_active: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.discount_price === null || v.discount_price < v.price, {
    message: "Harga diskon variasi harus lebih kecil dari harga normal.",
  });

/**
 * Simpan seluruh daftar variasi sekaligus. Kepemilikan, mode kirim, dan reset
 * moderasi ditegakkan di RPC `set_product_variants` (SECURITY DEFINER).
 */
export const saveProductVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        variants: z
          .array(variantInput)
          .max(20)
          .refine(
            (list) =>
              new Set(list.map((v) => v.name.trim().toLowerCase())).size === list.length,
            { message: "Nama variasi tidak boleh sama." },
          ),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { rpcErrorMessage } = await import("./transaction.server");
    const { error } = await (context as Ctx).supabase.rpc("set_product_variants", {
      _product_id: data.productId,
      _variants: data.variants,
    });
    if (error) return { ok: false as const, error: rpcErrorMessage(error.message) };
    return { ok: true as const };
  });
