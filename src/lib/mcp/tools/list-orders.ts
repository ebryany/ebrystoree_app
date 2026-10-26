import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_orders",
  title: "Daftar pesanan",
  description:
    "Menampilkan pesanan terbaru beserta status, total, dan status pembayarannya. Bisa difilter status, jenis pesanan, dan rentang tanggal.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("Filter status pesanan, mis. awaiting_payment, paid, completed."),
    order_type: z.enum(["all", "digital_product", "service"]).optional().describe("Jenis pesanan."),
    from: z.string().trim().optional().describe("Tanggal awal ISO (YYYY-MM-DD)."),
    to: z.string().trim().optional().describe("Tanggal akhir ISO (YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, order_type, from, to, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, order_type, status, subtotal, total, currency, created_at, paid_at, payments(payment_number, status, method, expected_amount)",
      );
    if (status) query = query.eq("status", status);
    if (order_type && order_type !== "all") query = query.eq("order_type", order_type);
    if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59Z`);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});