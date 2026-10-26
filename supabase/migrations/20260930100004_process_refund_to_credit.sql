-- ============================================================================
-- Hubungkan process_refund → kredit saldo Ebrystore.
--
-- Perubahan: process_refund kini memanggil credit_refund_to_balance() setelah
--            refund selesai. Logic lain IDENTIK dengan versi sebelumnya.
--
-- Idempotency: credit_refund_to_balance() memakai idempotency_key unik
--              ('refund:<id>'), sehingga pemanggilan berulang tidak dobel-kredit.
--
-- Lingkungan: LOKAL / Supabase baru saja. JANGAN production.
-- Rollback: jalankan ulang definisi process_refund dari
--           20260930100000_fix_refund_actor_type.sql (tanpa pemanggilan kredit).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_refund(_refund_id uuid, _reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; v_order public.orders; v_paid bigint; v_credit jsonb;
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

  -- Kredit refund sebagai saldo Ebrystore (idempoten).
  v_credit := public.credit_refund_to_balance(r.id);

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (r.customer_id, 'refund_completed', 'Refund selesai',
          'Dana refund untuk ' || r.refund_number || ' telah dikirim.', 'refund', r.id);

  PERFORM public.write_audit_log('refund.process', 'refund', r.id, to_jsonb(r),
    jsonb_build_object('status','completed','credit',v_credit), _reference, NULL, NULL);

  RETURN jsonb_build_object('status', 'completed', 'credit', v_credit);
END; $$;

REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, text) TO authenticated;
