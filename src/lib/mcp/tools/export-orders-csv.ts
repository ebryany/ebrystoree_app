import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default defineTool({
  name: "export_orders_csv",
  title: "Ekspor pesanan ke CSV",
  description:
    "Mengekspor daftar pesanan pada rentang tanggal menjadi teks CSV siap disimpan (nomor, tanggal, jenis, status, total, catatan).",
  inputSchema: {
    from: z.string().trim().optional().describe("Tanggal awal (YYYY-MM-DD). Default 30 hari terakhir."),
    to: z.string().trim().optional().describe("Tanggal akhir (YYYY-MM-DD). Default hari ini."),
    status: z.string().trim().max(40).optional().describe("Filter status pesanan."),
    order_type: z.enum(["all", "digital_product", "service"]).optional().describe("Filter jenis pesanan."),
    limit: z.number().int().min(1).max(1000).optional().describe("Maksimal baris (default 300)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, status, order_type, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const end = to ? new Date(`${to}T23:59:59Z`) : new Date();
    const start = from ? new Date(`${from}T00:00:00Z`) : new Date(end.getTime() - 30 * 86400000);

    let query = supabase
      .from("orders")
      .select("order_number, created_at, paid_at, order_type, status, currency, subtotal, discount_total, admin_fee, total, customer_note")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    if (status) query = query.eq("status", status);
    if (order_type && order_type !== "all") query = query.eq("order_type", order_type);

    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 300);
    if (error) return errorResult(error.message);

    const header = [
      "order_number","created_at","paid_at","order_type","status","currency","subtotal","discount_total","admin_fee","total","customer_note",
    ];
    const lines = [header.join(",")];
    for (const row of data ?? []) {
      lines.push(header.map((h) => csvCell((row as Record<string, unknown>)[h])).join(","));
    }
    const csv = lines.join("\n");

    return {
      content: [{ type: "text" as const, text: csv }],
      structuredContent: {
        baris: (data ?? []).length,
        periode: { dari: start.toISOString(), sampai: end.toISOString() },
        csv,
      },
    };
  },
});
