-- ============ TABLES ============
CREATE TABLE public.job_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.operator_assignments(id) ON DELETE SET NULL,
  operator_id uuid NOT NULL,
  percent integer NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  note text NOT NULL,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_progress TO authenticated;
GRANT ALL ON public.job_progress TO service_role;
ALTER TABLE public.job_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "progress_select_customer" ON public.job_progress FOR SELECT TO authenticated
  USING (is_public AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "progress_select_operator" ON public.job_progress FOR SELECT TO authenticated
  USING (operator_id = auth.uid());
CREATE POLICY "progress_select_staff" ON public.job_progress FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.view'));
CREATE TRIGGER job_progress_set_updated_at BEFORE UPDATE ON public.job_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_job_progress_order ON public.job_progress(order_id, created_at DESC);

CREATE TABLE public.job_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.operator_assignments(id) ON DELETE SET NULL,
  operator_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  summary text NOT NULL,
  delivery_note text,
  result_url text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','accepted','revision_requested','superseded')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version)
);
GRANT SELECT ON public.job_results TO authenticated;
GRANT ALL ON public.job_results TO service_role;
ALTER TABLE public.job_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "result_select_customer" ON public.job_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "result_select_operator" ON public.job_results FOR SELECT TO authenticated
  USING (operator_id = auth.uid());
CREATE POLICY "result_select_staff" ON public.job_results FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.view'));
CREATE TRIGGER job_results_set_updated_at BEFORE UPDATE ON public.job_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_job_results_order ON public.job_results(order_id, version DESC);

CREATE TABLE public.job_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  result_id uuid REFERENCES public.job_results(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL,
  sequence integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','in_progress','completed','rejected')),
  is_chargeable boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.job_revisions TO authenticated;
GRANT ALL ON public.job_revisions TO service_role;
ALTER TABLE public.job_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revision_select_customer" ON public.job_revisions FOR SELECT TO authenticated
  USING (customer_id = auth.uid());
CREATE POLICY "revision_select_operator" ON public.job_revisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_assignments a
                 WHERE a.order_id = job_revisions.order_id AND a.operator_id = auth.uid()));
CREATE POLICY "revision_select_staff" ON public.job_revisions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.view'));
CREATE TRIGGER job_revisions_set_updated_at BEFORE UPDATE ON public.job_revisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_job_revisions_order ON public.job_revisions(order_id, created_at DESC);

-- ============ PERMISSIONS ============
INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('orders.fulfill', 'Fulfillment', 'Mengerjakan order jasa yang ditugaskan (terima, mulai, progres, kirim hasil)', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('operator', 'orders.fulfill'),
  ('admin', 'orders.fulfill'),
  ('super_admin', 'orders.fulfill')
ON CONFLICT DO NOTHING;

-- ============ RLS: operator dapat membaca order yang ditugaskan ============
CREATE POLICY "orders_select_operator" ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_assignments a
                 WHERE a.order_id = orders.id AND a.operator_id = auth.uid()));
CREATE POLICY "order_items_select_operator" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_assignments a
                 WHERE a.order_id = order_items.order_id AND a.operator_id = auth.uid()));
CREATE POLICY "service_details_select_operator" ON public.service_order_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_assignments a
                 WHERE a.order_id = service_order_details.order_id AND a.operator_id = auth.uid()));
CREATE POLICY "history_select_operator" ON public.order_status_histories FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.operator_assignments a
                 WHERE a.order_id = order_status_histories.order_id AND a.operator_id = auth.uid()));

-- ============ RPC: assign operator ============
CREATE OR REPLACE FUNCTION public.assign_operator(
  _order_id uuid, _operator_id uuid, _deadline timestamptz DEFAULT NULL, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order public.orders; v_assign uuid; v_days integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.order_type <> 'service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status <> 'waiting_assignment' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _operator_id
                 AND role IN ('operator','admin','super_admin')) THEN
    RAISE EXCEPTION 'OPERATOR_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.operator_assignments
             WHERE order_id = _order_id AND status IN ('assigned','accepted','in_progress')) THEN
    RAISE EXCEPTION 'ALREADY_ASSIGNED';
  END IF;

  SELECT COALESCE(estimated_days, 1) INTO v_days FROM public.service_order_details WHERE order_id = _order_id;

  INSERT INTO public.operator_assignments (order_id, operator_id, assigned_by, status, deadline_at, internal_note)
  VALUES (_order_id, _operator_id, v_user, 'assigned',
          COALESCE(_deadline, now() + (COALESCE(v_days,1) || ' days')::interval), NULLIF(_note,''))
  RETURNING id INTO v_assign;

  UPDATE public.orders SET status = 'assigned' WHERE id = _order_id;
  UPDATE public.service_order_details
     SET internal_deadline = COALESCE(_deadline, now() + (COALESCE(v_days,1) || ' days')::interval)
   WHERE order_id = _order_id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
  VALUES (_order_id, v_order.status, 'assigned', v_user, 'admin', 'Pesanan ditugaskan ke operator.', _note);

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = COALESCE(_note, note)
   WHERE task_type = 'assign_operator' AND source_type = 'order' AND source_id = _order_id
     AND status IN ('open','in_progress','blocked');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id) VALUES
    (_operator_id, 'assignment.created', 'Tugas baru',
     'Anda ditugaskan mengerjakan order ' || v_order.order_number || '.', 'order', _order_id),
    (v_order.user_id, 'order.assigned', 'Operator ditugaskan',
     'Pesanan ' || v_order.order_number || ' sudah ditugaskan ke operator kami.', 'order', _order_id);

  PERFORM public.write_audit_log('order.assign', 'order', _order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status','assigned','operator_id',_operator_id), _note, NULL, NULL);

  RETURN jsonb_build_object('assignment_id', v_assign, 'status', 'assigned');
END; $$;

-- ============ RPC: operator lifecycle ============
CREATE OR REPLACE FUNCTION public.operator_update_assignment(
  _order_id uuid, _action text, _note text DEFAULT NULL, _percent integer DEFAULT NULL, _is_public boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order public.orders; v_a public.operator_assignments;
        v_new_order text; v_new_assign text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.fulfill') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _action NOT IN ('accept','start','progress') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;

  SELECT * INTO v_a FROM public.operator_assignments
   WHERE order_id = _order_id AND status IN ('assigned','accepted','in_progress') FOR UPDATE;
  IF v_a.id IS NULL OR v_a.operator_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;

  IF _action = 'accept' THEN
    IF v_a.status <> 'assigned' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    v_new_assign := 'accepted'; v_new_order := 'queued';
    UPDATE public.operator_assignments SET status = 'accepted', accepted_at = now() WHERE id = v_a.id;
    UPDATE public.orders SET status = 'queued' WHERE id = _order_id;
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (_order_id, v_order.status, 'queued', v_user, 'operator', 'Operator menerima tugas, pesanan masuk antrean.');
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'order.queued', 'Pesanan masuk antrean',
            'Operator telah menerima pesanan ' || v_order.order_number || '.', 'order', _order_id);

  ELSIF _action = 'start' THEN
    IF v_a.status NOT IN ('assigned','accepted') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    v_new_assign := 'in_progress'; v_new_order := 'in_progress';
    UPDATE public.operator_assignments
       SET status = 'in_progress', accepted_at = COALESCE(accepted_at, now()), started_at = now() WHERE id = v_a.id;
    UPDATE public.orders SET status = 'in_progress' WHERE id = _order_id;
    INSERT INTO public.job_progress (order_id, assignment_id, operator_id, percent, note, is_public)
    VALUES (_order_id, v_a.id, v_user, 0, COALESCE(NULLIF(_note,''), 'Pengerjaan dimulai.'), true);
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (_order_id, v_order.status, 'in_progress', v_user, 'operator', 'Pengerjaan dimulai.');
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'order.in_progress', 'Pengerjaan dimulai',
            'Pesanan ' || v_order.order_number || ' sedang dikerjakan.', 'order', _order_id);

  ELSE
    IF v_a.status <> 'in_progress' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    IF _note IS NULL OR length(btrim(_note)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    v_new_assign := v_a.status; v_new_order := v_order.status;
    INSERT INTO public.job_progress (order_id, assignment_id, operator_id, percent, note, is_public)
    VALUES (_order_id, v_a.id, v_user, COALESCE(_percent, 0), btrim(_note), COALESCE(_is_public, true));
    IF COALESCE(_is_public, true) THEN
      INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
      VALUES (_order_id, v_order.status, v_order.status, v_user, 'operator',
              'Progres ' || COALESCE(_percent,0) || '%: ' || btrim(_note));
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.progress', 'Progres diperbarui',
              'Pesanan ' || v_order.order_number || ' kini ' || COALESCE(_percent,0) || '%.', 'order', _order_id);
    END IF;
  END IF;

  PERFORM public.write_audit_log('assignment.' || _action, 'order', _order_id,
    jsonb_build_object('order_status', v_order.status, 'assignment_status', v_a.status),
    jsonb_build_object('order_status', v_new_order, 'assignment_status', v_new_assign), _note, NULL, NULL);

  RETURN jsonb_build_object('order_status', v_new_order, 'assignment_status', v_new_assign);
END; $$;

-- ============ RPC: submit result ============
CREATE OR REPLACE FUNCTION public.submit_job_result(
  _order_id uuid, _summary text, _delivery_note text DEFAULT NULL, _result_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order public.orders; v_a public.operator_assignments;
        v_version integer; v_result uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.fulfill') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _summary IS NULL OR length(btrim(_summary)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_a FROM public.operator_assignments
   WHERE order_id = _order_id AND status IN ('assigned','accepted','in_progress') FOR UPDATE;
  IF v_a.id IS NULL OR v_a.operator_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.status NOT IN ('in_progress','queued','assigned') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.job_results SET status = 'superseded' WHERE order_id = _order_id AND status = 'submitted';
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version FROM public.job_results WHERE order_id = _order_id;

  INSERT INTO public.job_results (order_id, assignment_id, operator_id, version, summary, delivery_note, result_url)
  VALUES (_order_id, v_a.id, v_user, v_version, btrim(_summary), NULLIF(_delivery_note,''), NULLIF(_result_url,''))
  RETURNING id INTO v_result;

  UPDATE public.job_revisions SET status = 'completed', resolved_at = now()
   WHERE order_id = _order_id AND status IN ('requested','in_progress');

  UPDATE public.operator_assignments SET status = 'in_progress', started_at = COALESCE(started_at, now())
   WHERE id = v_a.id;
  UPDATE public.orders SET status = 'waiting_customer_review' WHERE id = _order_id;

  INSERT INTO public.job_progress (order_id, assignment_id, operator_id, percent, note, is_public)
  VALUES (_order_id, v_a.id, v_user, 100, 'Hasil pekerjaan versi ' || v_version || ' dikirim.', true);

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'waiting_customer_review', v_user, 'operator',
          'Hasil pekerjaan versi ' || v_version || ' dikirim, menunggu review pelanggan.');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_order.user_id, 'order.result_submitted', 'Hasil pekerjaan siap direview',
          'Hasil pesanan ' || v_order.order_number || ' sudah dikirim. Mohon tinjau.', 'order', _order_id);

  PERFORM public.write_audit_log('assignment.submit_result', 'order', _order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status','waiting_customer_review','result_id',v_result,'version',v_version),
    NULL, NULL, NULL);

  RETURN jsonb_build_object('result_id', v_result, 'version', v_version, 'order_status', 'waiting_customer_review');
END; $$;

-- ============ RPC: customer review ============
CREATE OR REPLACE FUNCTION public.review_job_result(
  _order_id uuid, _decision text, _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order public.orders; v_result public.job_results;
        v_a public.operator_assignments; v_used integer; v_allow integer; v_seq integer; v_charge boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision NOT IN ('approve','revision') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status <> 'waiting_customer_review' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT * INTO v_result FROM public.job_results
   WHERE order_id = _order_id AND status = 'submitted' ORDER BY version DESC LIMIT 1;
  IF v_result.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT * INTO v_a FROM public.operator_assignments
   WHERE order_id = _order_id AND status IN ('assigned','accepted','in_progress') FOR UPDATE;

  IF _decision = 'approve' THEN
    UPDATE public.job_results SET status = 'accepted', reviewed_at = now() WHERE id = v_result.id;
    UPDATE public.operator_assignments SET status = 'completed', completed_at = now() WHERE id = v_a.id;
    UPDATE public.orders SET status = 'completed', completed_at = now() WHERE id = _order_id;

    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (_order_id, v_order.status, 'completed', v_user, 'customer', 'Pelanggan menyetujui hasil pekerjaan.');
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_a.operator_id, 'order.completed', 'Hasil disetujui',
            'Pelanggan menyetujui hasil order ' || v_order.order_number || '.', 'order', _order_id);
    PERFORM public.write_audit_log('order.result_approved', 'order', _order_id,
      jsonb_build_object('status', v_order.status), jsonb_build_object('status','completed'), NULL, NULL, NULL);
    RETURN jsonb_build_object('order_status', 'completed');
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT COALESCE(revision_allowance, 0) INTO v_allow FROM public.service_order_details WHERE order_id = _order_id;
  SELECT COUNT(*) INTO v_used FROM public.job_revisions WHERE order_id = _order_id;
  IF v_used >= v_allow THEN v_charge := true; END IF;
  v_seq := v_used + 1;

  INSERT INTO public.job_revisions (order_id, result_id, customer_id, sequence, reason, status, is_chargeable)
  VALUES (_order_id, v_result.id, v_user, v_seq, btrim(_reason), 'requested', v_charge);

  UPDATE public.job_results SET status = 'revision_requested', reviewed_at = now() WHERE id = v_result.id;
  UPDATE public.orders SET status = 'in_progress' WHERE id = _order_id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'in_progress', v_user, 'customer',
          'Pelanggan meminta revisi ke-' || v_seq || ': ' || btrim(_reason));

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_a.operator_id, 'order.revision_requested', 'Permintaan revisi',
          'Order ' || v_order.order_number || ' butuh revisi: ' || btrim(_reason), 'order', _order_id);

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_revision', 'order', _order_id, 'Revisi order ' || v_order.order_number, btrim(_reason),
          CASE WHEN v_charge THEN 'high' ELSE 'normal' END)
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

  PERFORM public.write_audit_log('order.revision_requested', 'order', _order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status','in_progress','sequence',v_seq,'chargeable',v_charge), btrim(_reason), NULL, NULL);

  RETURN jsonb_build_object('order_status', 'in_progress', 'sequence', v_seq, 'chargeable', v_charge);
END; $$;

-- ============ HARDENING ============
REVOKE EXECUTE ON FUNCTION public.assign_operator(uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.operator_update_assignment(uuid, text, text, integer, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_job_result(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_job_result(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_operator(uuid, uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operator_update_assignment(uuid, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_job_result(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_job_result(uuid, text, text) TO authenticated;