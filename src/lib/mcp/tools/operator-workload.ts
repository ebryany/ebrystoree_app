import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "operator_workload",
  title: "Beban kerja operator",
  description:
    "Menghitung beban kerja tiap operator: tugas aktif, tugas selesai, deadline terdekat, dan pekerjaan yang lewat tenggat — untuk membantu memilih operator saat penugasan.",
  inputSchema: {
    days: z
      .number()
      .int()
      .min(1)
      .max(180)
      .optional()
      .describe("Rentang hari penugasan (default 30)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const span = days ?? 30;
    const start = new Date(Date.now() - span * 86400000).toISOString();

    const { data: rows, error } = await supabase
      .from("operator_assignments")
      .select("id, order_id, operator_id, status, assigned_at, deadline_at, completed_at")
      .gte("assigned_at", start);
    if (error) return errorResult(error.message);

    const now = Date.now();
    const per = new Map<
      string,
      {
        operator_id: string;
        total: number;
        aktif: number;
        selesai: number;
        lewat_tenggat: number;
        deadline_terdekat: string | null;
      }
    >();
    for (const r of rows ?? []) {
      const bucket = per.get(r.operator_id) ?? {
        operator_id: r.operator_id,
        total: 0,
        aktif: 0,
        selesai: 0,
        lewat_tenggat: 0,
        deadline_terdekat: null,
      };
      bucket.total += 1;
      const done = r.status === "completed" || Boolean(r.completed_at);
      if (done) bucket.selesai += 1;
      else {
        bucket.aktif += 1;
        if (r.deadline_at) {
          if (new Date(r.deadline_at).getTime() < now) bucket.lewat_tenggat += 1;
          if (!bucket.deadline_terdekat || r.deadline_at < bucket.deadline_terdekat) {
            bucket.deadline_terdekat = r.deadline_at;
          }
        }
      }
      per.set(r.operator_id, bucket);
    }

    const { data: operatorRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "operator");
    const operatorIds = new Set([
      ...(operatorRoles ?? []).map((r: any) => r.user_id),
      ...per.keys(),
    ]);
    const ids = [...operatorIds];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as any[] };
    const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const items = ids
      .map((id) => ({
        nama: byId.get(id)?.full_name ?? null,
        email: byId.get(id)?.email ?? null,
        // operator_id ikut dari `per` supaya tidak ada penulisan ganda pada
        // kunci yang sama; operator tanpa aktivitas memakai nilai default.
        ...(per.get(id) ?? {
          operator_id: id,
          total: 0,
          aktif: 0,
          selesai: 0,
          lewat_tenggat: 0,
          deadline_terdekat: null,
        }),
      }))
      .sort((a, b) => b.aktif - a.aktif);

    return jsonResult({ periode_hari: span, operator: items });
  },
});
