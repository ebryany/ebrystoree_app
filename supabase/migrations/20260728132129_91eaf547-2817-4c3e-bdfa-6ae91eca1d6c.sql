-- ============ REFUND: keputusan ============
CREATE OR REPLACE FUNCTION public.review_refund(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; v_new text; v_order public.orders;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision NOT IN ('approve','reject','request_info') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  IF _decision = 'reject' THEN
    IF NOT public.has_permission(auth.uid(), 'refunds.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(auth.uid(), 'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;

  SELECT * INTO r FROM public.refunds WHERE id = _refund_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status NOT IN ('requested','under_review','information_requested') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  v_new := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'information_requested' END;

  UPDATE public.refunds
     SET status = v_new, reviewed_by = auth.uid(), reviewed_at = now(), decision_note = _reason
   WHERE id = r.id;

  SELECT * INTO v_order FROM public.orders WHERE id = r.order_id;

  IF _decision = 'approve' THEN
    UPDATE public.orders SET status = 'refund_processing' WHERE id = r.order_id;
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (r.order_id, v_order.status, 'refund_processing', auth.uid(), 'staff', 'Refund disetujui, menunggu pengiriman dana');
  ELSIF _decision = 'reject' THEN
    UPDATE public.orders SET status = 'completed' WHERE id = r.order_id AND status = 'refund_requested';
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
    VALUES (r.order_id, v_order.status, 'completed', auth.uid(), 'staff', 'Pengajuan refund ditolak', _reason);
  END IF;

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (r.customer_id, 'refund_' || v_new, 'Status refund diperbarui',
          'Pengajuan refund ' || r.refund_number || ' kini berstatus ' || v_new || '.', 'refund', r.id);

  IF _decision <> 'request_info' THEN
    UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
     WHERE source_type = 'refund' AND source_id = r.id AND status <> 'completed';
  END IF;

  PERFORM public.write_audit_log('refund.' || _decision, 'refund', r.id,
    to_jsonb(r), jsonb_build_object('status', v_new), _reason, NULL, NULL);

  RETURN jsonb_build_object('status', v_new);
END; $$;

-- ============ REFUND: eksekusi dana ============
CREATE OR REPLACE FUNCTION public.process_refund(_refund_id uuid, _reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; v_order public.orders; v_paid bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'refunds.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _reference IS NULL OR length(btrim(_reference)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO r FROM public.refunds WHERE id = _refund_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status NOT IN ('approved','processing') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = r.order_id;

  UPDATE public.refunds
     SET status = 'completed', processing_reference = _reference, processed_at = now()
   WHERE id = r.id;

  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.refunds
   WHERE order_id = r.order_id AND status = 'completed';

  UPDATE public.payments
     SET status = CASE WHEN v_paid >= v_order.total THEN 'refunded' ELSE 'partially_refunded' END
   WHERE id = r.payment_id;

  UPDATE public.orders SET status = 'refunded' WHERE id = r.order_id;
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (r.order_id, v_order.status, 'refunded', auth.uid(), 'staff', 'Dana refund telah dikirim');

  UPDATE public.digital_entitlements SET revoked_at = now()
   WHERE order_id = r.order_id AND revoked_at IS NULL;

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (r.customer_id, 'refund_completed', 'Refund selesai',
          'Dana refund untuk ' || r.refund_number || ' telah dikirim.', 'refund', r.id);

  PERFORM public.write_audit_log('refund.process', 'refund', r.id, to_jsonb(r),
    jsonb_build_object('status','completed'), _reference, NULL, NULL);

  RETURN jsonb_build_object('status', 'completed');
END; $$;

-- ============ TASK operasional ============
CREATE OR REPLACE FUNCTION public.update_admin_task(_task_id uuid, _action text, _assignee uuid DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END; $$;

REVOKE EXECUTE ON FUNCTION public.review_refund(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_admin_task(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_task(uuid, text, uuid, text) TO authenticated;