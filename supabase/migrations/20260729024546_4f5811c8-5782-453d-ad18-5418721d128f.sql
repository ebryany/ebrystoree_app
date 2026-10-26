
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','error')),
  affected_count integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scheduled_job_runs TO authenticated;
GRANT ALL ON public.scheduled_job_runs TO service_role;
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_job_runs" ON public.scheduled_job_runs;
CREATE POLICY "staff_read_job_runs" ON public.scheduled_job_runs
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit_logs.view'));

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_name_time
  ON public.scheduled_job_runs (job_name, started_at DESC);

-- 1) Kedaluwarsa order yang tidak dibayar
CREATE OR REPLACE FUNCTION public.job_expire_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0; v_start timestamptz := now();
BEGIN
  FOR r IN
    SELECT id, order_number, user_id, status
      FROM public.orders
     WHERE status IN ('draft','awaiting_payment')
       AND expired_at IS NOT NULL
       AND expired_at < now()
     LIMIT 200
  LOOP
    UPDATE public.orders
       SET status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = COALESCE(cancellation_reason, 'Kedaluwarsa otomatis: batas waktu pembayaran terlewati.')
     WHERE id = r.id;

    UPDATE public.payments
       SET status = 'expired', failed_at = now()
     WHERE order_id = r.id AND status IN ('draft','pending','waiting_payment','rejected');

    UPDATE public.invoices SET status = 'cancelled' WHERE order_id = r.id AND status <> 'paid';

    UPDATE public.admin_tasks SET status = 'cancelled', note = 'Order kedaluwarsa otomatis'
     WHERE source_type = 'order' AND source_id = r.id AND status IN ('open','in_progress','blocked');

    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_type, public_note)
    VALUES (r.id, r.status, 'cancelled', 'system', 'Pesanan dibatalkan otomatis karena melewati batas waktu pembayaran.');

    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (r.user_id, 'order.expired', 'Pesanan kedaluwarsa',
            'Pesanan ' || r.order_number || ' dibatalkan otomatis karena belum dibayar sampai batas waktu.', 'order', r.id);

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, detail, started_at, finished_at)
  VALUES ('expire_orders', 'success', v_count, jsonb_build_object('expired_orders', v_count), v_start, now());

  RETURN jsonb_build_object('job', 'expire_orders', 'affected', v_count);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, error_message, started_at, finished_at)
  VALUES ('expire_orders', 'error', v_count, SQLERRM, v_start, now());
  RETURN jsonb_build_object('job', 'expire_orders', 'error', SQLERRM);
END; $$;

-- 2) Tugas operasional yang melewati due date
CREATE OR REPLACE FUNCTION public.job_flag_overdue_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0; v_start timestamptz := now();
BEGIN
  FOR r IN
    SELECT id, task_number, title, assignee_id
      FROM public.admin_tasks
     WHERE status IN ('open','in_progress','blocked')
       AND due_at IS NOT NULL AND due_at < now()
       AND priority <> 'urgent'
     LIMIT 200
  LOOP
    UPDATE public.admin_tasks
       SET priority = 'urgent',
           note = COALESCE(note || E'\n', '') || 'Eskalasi otomatis: melewati tenggat pada ' || to_char(now() AT TIME ZONE 'Asia/Makassar', 'DD-MM-YYYY HH24:MI')
     WHERE id = r.id;

    IF r.assignee_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (r.assignee_id, 'task.overdue', 'Tugas melewati tenggat',
              'Tugas ' || r.task_number || ' (' || r.title || ') sudah melewati tenggat.', 'admin_task', r.id);
    ELSE
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      SELECT DISTINCT ur.user_id, 'task.overdue', 'Tugas melewati tenggat',
             'Tugas ' || r.task_number || ' (' || r.title || ') belum ditangani dan sudah melewati tenggat.', 'admin_task', r.id
        FROM public.user_roles ur WHERE ur.role IN ('admin','super_admin');
    END IF;

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, detail, started_at, finished_at)
  VALUES ('flag_overdue_tasks', 'success', v_count, jsonb_build_object('escalated_tasks', v_count), v_start, now());

  RETURN jsonb_build_object('job', 'flag_overdue_tasks', 'affected', v_count);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, error_message, started_at, finished_at)
  VALUES ('flag_overdue_tasks', 'error', v_count, SQLERRM, v_start, now());
  RETURN jsonb_build_object('job', 'flag_overdue_tasks', 'error', SQLERRM);
END; $$;

-- 3) SLA pengerjaan operator terlewat
CREATE OR REPLACE FUNCTION public.job_check_sla_breach()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0; v_start timestamptz := now();
BEGIN
  FOR r IN
    SELECT a.id, a.order_id, a.operator_id, o.order_number
      FROM public.operator_assignments a
      JOIN public.orders o ON o.id = a.order_id
     WHERE a.status IN ('assigned','accepted','in_progress')
       AND a.deadline_at IS NOT NULL AND a.deadline_at < now()
     LIMIT 200
  LOOP
    INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
    VALUES ('sla_breach', 'order', r.order_id,
            'SLA terlewat pada order ' || r.order_number,
            'Tenggat pengerjaan operator sudah lewat. Perlu tindak lanjut atau penjadwalan ulang.', 'urgent')
    ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

    IF FOUND THEN
      IF r.operator_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
        VALUES (r.operator_id, 'assignment.sla_breach', 'Tenggat pengerjaan terlewat',
                'Order ' || r.order_number || ' sudah melewati tenggat pengerjaan.', 'order', r.order_id);
      END IF;

      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      SELECT DISTINCT ur.user_id, 'assignment.sla_breach', 'SLA order terlewat',
             'Order ' || r.order_number || ' melewati SLA pengerjaan dan butuh tindak lanjut.', 'order', r.order_id
        FROM public.user_roles ur WHERE ur.role IN ('admin','super_admin');

      v_count := v_count + 1;
    END IF;
  END LOOP;

  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, detail, started_at, finished_at)
  VALUES ('check_sla_breach', 'success', v_count, jsonb_build_object('sla_breaches', v_count), v_start, now());

  RETURN jsonb_build_object('job', 'check_sla_breach', 'affected', v_count);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.scheduled_job_runs (job_name, status, affected_count, error_message, started_at, finished_at)
  VALUES ('check_sla_breach', 'error', v_count, SQLERRM, v_start, now());
  RETURN jsonb_build_object('job', 'check_sla_breach', 'error', SQLERRM);
END; $$;

REVOKE EXECUTE ON FUNCTION public.job_expire_orders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.job_flag_overdue_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.job_check_sla_breach() FROM PUBLIC, anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_job_runs;
