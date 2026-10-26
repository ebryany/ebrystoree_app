import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "sales_summary",
  title: "Ringkasan penjualan",
  description:
    "Merangkum penjualan pada rentang tanggal: jumlah pesanan per status, total omzet dari pesanan lunas, dan produk digital terlaris.",
  inputSchema: {
    from: z.string().trim().optional().describe("Tanggal awal (YYYY-MM-DD). Default 30 hari terakhir."),
    to: z.string().trim().optional().describe("Tanggal akhir (YYYY-MM-DD). Default hari ini."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const end = to ? new Date(`${to}T23:59:59Z`) : new Date();
    const start = from ? new Date(`${from}T00:00:00Z`) : new Date(end.getTime() - 30 * 86400000);

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, status, total, order_type, paid_at, created_at")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    if (error) return errorResult(error.message);

    const rows = orders ?? [];
    const paidStatuses = new Set(["paid", "processing", "delivered", "completed"]);
    const perStatus: Record<string, number> = {};
    let omzet = 0;
    for (const o of rows) {
      perStatus[o.status] = (perStatus[o.status] ?? 0) + 1;
      if (paidStatuses.has(o.status) || o.paid_at) omzet += Number(o.total ?? 0);
    }

    const { data: topProducts } = await supabase
      .from("digital_products")
      .select("id, name, slug, sold_count, price, available_stock, status")
      .is("deleted_at", null)
      .order("sold_count", { ascending: false })
      .limit(5);

    return jsonResult({
      periode: { dari: start.toISOString(), sampai: end.toISOString() },
      total_pesanan: rows.length,
      pesanan_per_status: perStatus,
      omzet_lunas: omzet,
      produk_terlaris: topProducts ?? [],
    });
  },
});