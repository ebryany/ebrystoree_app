import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "customer_insights",
  title: "Analitik pelanggan",
  description:
    "Menampilkan pelanggan teratas berdasarkan belanja lunas, jumlah pelanggan baru, dan tingkat pembelian ulang pada rentang hari tertentu.",
  inputSchema: {
    days: z.number().int().min(1).max(365).optional().describe("Rentang hari (default 30)."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah pelanggan teratas (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const span = days ?? 30;
    const start = new Date(Date.now() - span * 86400000).toISOString();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, user_id, status, total, paid_at, created_at")
      .gte("created_at", start);
    if (error) return errorResult(error.message);

    const paidStatuses = new Set(["paid", "processing", "delivered", "completed"]);
    const per = new Map<string, { user_id: string; pesanan: number; lunas: number; belanja: number }>();
    for (const o of orders ?? []) {
      const bucket = per.get(o.user_id) ?? { user_id: o.user_id, pesanan: 0, lunas: 0, belanja: 0 };
      bucket.pesanan += 1;
      if (paidStatuses.has(o.status) || o.paid_at) {
        bucket.lunas += 1;
        bucket.belanja += Number(o.total ?? 0);
      }
      per.set(o.user_id, bucket);
    }
    const top = [...per.values()].sort((a, b) => b.belanja - a.belanja).slice(0, limit ?? 10);

    const ids = top.map((t) => t.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const { count: pelangganBaru } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start);

    const repeat = [...per.values()].filter((c) => c.lunas > 1).length;
    const pembeli = [...per.values()].filter((c) => c.lunas > 0).length;

    return jsonResult({
      periode_hari: span,
      pelanggan_baru: pelangganBaru ?? 0,
      pelanggan_bertransaksi: pembeli,
      pembeli_berulang: repeat,
      tingkat_pembelian_ulang: pembeli ? Number(((repeat / pembeli) * 100).toFixed(1)) : 0,
      pelanggan_teratas: top.map((t) => ({
        ...t,
        nama: nameById.get(t.user_id)?.full_name ?? null,
        email: nameById.get(t.user_id)?.email ?? null,
      })),
    });
  },
});
