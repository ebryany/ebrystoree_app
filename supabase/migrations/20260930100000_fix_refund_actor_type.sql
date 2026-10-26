-- ============================================================================
-- FIX A-01: Refund tidak dapat dieksekusi karena actor_type='staff' melanggar
-- CHECK constraint order_status_histories.actor_type.
--
-- Akar masalah:
--   - 20260728131303 : CHECK (actor_type IN ('customer','admin','finance',
--                       'operator','support','system'))
--   - 20260728132129 : review_refund & process_refund menulis 'staff'
--   => setiap approve/reject/process refund memicu CHECK violation + rollback.
--
-- Perbaikan (aditif):
--   Tulis ulang KEDUA fungsi dengan actor_type yang benar secara semantik.
--   Aktor yang menyetujui/memproses refund adalah finance/admin, jadi nilai
--   yang tepat adalah 'finance'. Seluruh logic lain dipertahankan identik.
--
-- Catatan: tidak ada perubahan skema; hanya CREATE OR REPLACE FUNCTION.
-- Rollback: jalankan ulang definisi lama dari 20260728132129 (mengembalikan bug).
-- ============================================================================

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
    VALUES (r.order_id, v_order.status, 'refund_processing', auth.uid(), 'finance', 'Refund disetujui, menunggu pengiriman dana');
  ELSIF _decision = 'reject' THEN
    UPDATE public.orders SET status = 'completed' WHERE id = r.order_id AND status = 'refund_requested';
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
    VALUES (r.order_id, v_order.status, 'completed', auth.uid(), 'finance', 'Pengajuan refund ditolak', _reason);
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
  VALUES (r.order_id, v_order.status, 'refunded', auth.uid(), 'finance', 'Dana refund telah dikirim');

  UPDATE public.digital_entitlements SET revoked_at = now()
   WHERE order_id = r.order_id AND revoked_at IS NULL;

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (r.customer_id, 'refund_completed', 'Refund selesai',
          'Dana refund untuk ' || r.refund_number || ' telah dikirim.', 'refund', r.id);

  PERFORM public.write_audit_log('refund.process', 'refund', r.id, to_jsonb(r),
    jsonb_build_object('status','completed'), _reference, NULL, NULL);

  RETURN jsonb_build_object('status', 'completed');
END; $$;

REVOKE EXECUTE ON FUNCTION public.review_refund(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, text) TO authenticated;
