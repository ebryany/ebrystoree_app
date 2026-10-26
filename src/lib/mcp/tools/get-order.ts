import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Detail pesanan",
  description:
    "Menampilkan detail satu pesanan: item, pembayaran, dan hak akses produk digital yang diterbitkan. Cari lewat nomor pesanan atau id.",
  inputSchema: {
    order_number: z.string().trim().min(3).optional().describe("Nomor pesanan, mis. ORD-000123."),
    id: z.string().uuid().optional().describe("ID pesanan."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order_number, id }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (!order_number && !id) return errorResult("Isi salah satu: order_number atau id.");
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orders")
      .select(
        "*, order_items(id, item_type, name_snapshot, quantity, unit_price, discount, total, product_id), payments(id, payment_number, method, provider, status, expected_amount, paid_amount, paid_at, expired_at), digital_entitlements(id, product_id, download_count, download_limit, valid_until, revoked_at)",
      )
      .limit(1);
    query = id ? query.eq("id", id) : query.eq("order_number", order_number!);
    const { data, error } = await query.maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Pesanan tidak ditemukan atau tidak dapat diakses akun ini.");
    return jsonResult({ order: data });
  },
});