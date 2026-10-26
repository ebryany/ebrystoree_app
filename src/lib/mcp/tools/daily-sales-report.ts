import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "daily_sales_report",
  title: "Laporan penjualan harian",
  description:
    "Laporan penjualan per hari: jumlah pesanan, omzet lunas, rata-rata nilai pesanan, dan rincian metode pembayaran.",
  inputSchema: {
    days: z.number().int().min(1).max(90).optional().describe("Jumlah hari terakhir (default 14)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const span = days ?? 14;
    const start = new Date(Date.now() - span * 86400000);

    const [{ data: orders, error }, { data: payments }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total, order_type, paid_at, created_at")
        .gte("created_at", start.toISOString()),
      supabase
        .from("payments")
        .select("id, method, provider, status, expected_amount, paid_amount, created_at")
        .gte("created_at", start.toISOString()),
    ]);
    if (error) return errorResult(error.message);

    const paidStatuses = new Set(["paid", "processing", "delivered", "completed"]);
    const perDay = new Map<string, { tanggal: string; pesanan: number; lunas: number; omzet: number }>();
    for (const o of orders ?? []) {
      const key = String(o.created_at).slice(0, 10);
      const bucket = perDay.get(key) ?? { tanggal: key, pesanan: 0, lunas: 0, omzet: 0 };
      bucket.pesanan += 1;
      if (paidStatuses.has(o.status) || o.paid_at) {
        bucket.lunas += 1;
        bucket.omzet += Number(o.total ?? 0);
      }
      perDay.set(key, bucket);
    }
    const harian = [...perDay.values()].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));

    const perMetode: Record<string, { jumlah: number; nominal: number }> = {};
    for (const p of payments ?? []) {
      const key = `${p.provider}/${p.method}`;
      const bucket = perMetode[key] ?? { jumlah: 0, nominal: 0 };
      bucket.jumlah += 1;
      if (p.status === "paid" || p.status === "verified") bucket.nominal += Number(p.paid_amount ?? p.expected_amount ?? 0);
      perMetode[key] = bucket;
    }

    const totalOmzet = harian.reduce((sum, d) => sum + d.omzet, 0);
    const totalLunas = harian.reduce((sum, d) => sum + d.lunas, 0);

    return jsonResult({
      periode_hari: span,
      total_pesanan: (orders ?? []).length,
      total_lunas: totalLunas,
      omzet_lunas: totalOmzet,
      rata_rata_nilai_pesanan: totalLunas ? Math.round(totalOmzet / totalLunas) : 0,
      harian,
      per_metode_pembayaran: perMetode,
    });
  },
});
