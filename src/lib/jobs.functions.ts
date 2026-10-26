import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");

type Ctx = { supabase: any; userId: string };

export const SCHEDULED_JOBS = [
  {
    name: "expire_orders",
    label: "Kedaluwarsa pesanan",
    schedule: "Setiap 10 menit",
    description:
      "Membatalkan pesanan yang melewati batas waktu bayar, menandai pembayaran kedaluwarsa, dan memberi tahu pelanggan.",
  },
  {
    name: "flag_overdue_tasks",
    label: "Tugas melewati tenggat",
    schedule: "Setiap jam (menit ke-5)",
    description: "Menaikkan prioritas tugas operasional yang telat menjadi mendesak dan mengirim notifikasi.",
  },
  {
    name: "check_sla_breach",
    label: "Pemantauan SLA pengerjaan",
    schedule: "Setiap 30 menit",
    description: "Membuat tugas eskalasi ketika tenggat pengerjaan operator terlewat.",
  },
] as const;

export type ScheduledJobName = (typeof SCHEDULED_JOBS)[number]["name"];

const RPC_BY_NAME: Record<string, string> = {
  expire_orders: "job_expire_orders",
  flag_overdue_tasks: "job_flag_overdue_tasks",
  check_sla_breach: "job_check_sla_breach",
};

async function guard<T>(
  context: Ctx,
  permission: string,
  run: () => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

export const listJobRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "audit_logs.view", async () => {
      const { data, error } = await context.supabase
        .from("scheduled_job_runs")
        .select("id, job_name, status, affected_count, detail, error_message, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) return { error: error.message, items: [] as any[] };
      return { items: (data ?? []) as any[] };
    }),
  );

export const runJobNow = createServerFn({ method: "POST" })
  .validator((data) => z.object({ job: z.enum(["expire_orders", "flag_overdue_tasks", "check_sla_breach"]) }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "settings.manage", async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: result, error } = await supabaseAdmin.rpc(RPC_BY_NAME[data.job] as any);
      if (error) return { error: error.message };
      try {
        await context.supabase.rpc("write_audit_log", {
          _action: "job.run_manual",
          _entity_type: "scheduled_job",
          _after: result as any,
          _reason: `Menjalankan job ${data.job} secara manual`,
        });
      } catch {
        /* audit tidak boleh memblokir eksekusi job */
      }
      return { result };
    }),
  );