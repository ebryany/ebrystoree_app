
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.admin_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.operator_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.job_progress REPLICA IDENTITY FULL;
ALTER TABLE public.job_results REPLICA IDENTITY FULL;
ALTER TABLE public.job_revisions REPLICA IDENTITY FULL;
ALTER TABLE public.order_status_histories REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','payments','admin_tasks','operator_assignments','job_progress','job_results','job_revisions','order_status_histories','notifications']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.update_admin_task(_task_id uuid, _action text, _assignee uuid DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE t public.admin_tasks; v_status text; v_assignee uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _action NOT IN ('claim','assign','complete','cancel','reopen') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;

  SELECT * INTO t FROM public.admin_tasks WHERE id = _task_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF _action = 'assign' THEN
    IF NOT public.has_permission(auth.uid(), 'tasks.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSIF NOT (public.has_permission(auth.uid(), 'tasks.update') OR t.assignee_id = auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _action = 'complete' AND t.task_type = 'assign_operator' AND t.source_type = 'order' AND t.source_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.operator_assignments oa
       WHERE oa.order_id = t.source_id
         AND oa.status NOT IN ('cancelled','rejected')
    ) THEN
      RAISE EXCEPTION 'ASSIGNMENT_REQUIRED';
    END IF;
  END IF;

  v_status := t.status; v_assignee := t.assignee_id;

  IF _action = 'claim' THEN v_status := 'in_progress'; v_assignee := auth.uid();
  ELSIF _action = 'assign' THEN
    IF _assignee IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    v_status := 'in_progress'; v_assignee := _assignee;
  ELSIF _action = 'complete' THEN v_status := 'completed';
  ELSIF _action = 'cancel' THEN v_status := 'cancelled';
  ELSE v_status := 'open'; v_assignee := NULL;
  END IF;

  UPDATE public.admin_tasks
     SET status = v_status,
         assignee_id = v_assignee,
         note = COALESCE(_note, note),
         completed_at = CASE WHEN v_status = 'completed' THEN now() ELSE NULL END
   WHERE id = t.id;

  PERFORM public.write_audit_log('task.' || _action, 'admin_task', t.id, to_jsonb(t),
    jsonb_build_object('status', v_status, 'assignee_id', v_assignee), _note, NULL, NULL);

  RETURN jsonb_build_object('status', v_status);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.update_admin_task(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_task(uuid, text, uuid, text) TO authenticated;
