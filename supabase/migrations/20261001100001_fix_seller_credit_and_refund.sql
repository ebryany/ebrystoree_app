-- ============================================================================
-- FIX SLICE A: Perbaikan Kritis Logika Bisnis Escrow/Held-Funds
--
-- Dokumen audit: docs/marketplace/03-escrow-audit-dan-rancangan.md
-- Tanggal: 2026-10-01
--
-- Daftar perbaikan:
--   F-01 (BUG-01): Trigger kredit seller tidak terpicu pada status 'completed'
--   F-02 (BUG-02): Idempotency key mismatch di credit_seller_earnings
--   F-03 (BUG-03): process_refund tidak mendebit saldo seller
--   F-04 (BUG-07): get_credit_balance tanpa guard ownership (IDOR)
--   F-05 (BUG-08): cancel/expire tidak reversal credit_used
--   F-06 (BUG-09): review_refund reject tidak reset payment status
--
-- Sifat: ADITIF. Tidak mengubah tabel/kolom/index.
-- Rollback: jalankan ulang definisi lama dari migrasi sebelumnya.
-- ============================================================================


-- ============================
-- F-01: Perbaiki trigger kredit seller
-- ============================
-- Kedua jalur pembayaran (verify_manual_payment, settle_gateway_payment)
-- langsung set order ke 'completed', bukan 'paid'.
-- Trigger lama hanya mendeteksi transisi ke 'paid'.

CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('paid', 'completed')
     AND OLD.status IS DISTINCT FROM 'paid'
     AND OLD.status IS DISTINCT FROM 'completed'
  THEN
    PERFORM public.credit_seller_earnings(NEW.id);
  END IF;
  RETURN NEW;
END; $$;


-- ============================
-- F-02: Perbaiki idempotency key di credit_seller_earnings
-- ============================
-- Lama: lookup key 'sale:<order>' tetapi insert key 'sale:<order>:<store>'
-- Baru: lookup per-store key agar multi-store order future-proof

CREATE OR REPLACE FUNCTION public.credit_seller_earnings(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store_key text;
  v_existing public.seller_ledger;
  r record;
  v_total bigint := 0;
  v_count int := 0;
  v_already int := 0;
BEGIN
  FOR r IN
    SELECT oi.store_id, SUM(oi.total) AS gross, s.name AS store_name
      FROM public.order_items oi
      JOIN public.stores s ON s.id = oi.store_id
     WHERE oi.order_id = _order_id AND oi.store_id IS NOT NULL
     GROUP BY oi.store_id, s.name
  LOOP
    v_store_key := 'sale:' || _order_id::text || ':' || r.store_id::text;

    SELECT * INTO v_existing FROM public.seller_ledger WHERE idempotency_key = v_store_key;
    IF v_existing.id IS NOT NULL THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.seller_ledger
      (store_id, direction, amount, gross_amount, platform_fee, source_type, order_id, reference, note, idempotency_key)
    VALUES
      (r.store_id, 'credit', r.gross, r.gross, 0, 'sale', _order_id,
       'ORDER:' || _order_id::text, 'Pendapatan penjualan ' || r.store_name,
       v_store_key);

    v_total := v_total + r.gross;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 AND v_already > 0 THEN
    RETURN jsonb_build_object('status', 'already_credited', 'stores', v_already);
  END IF;

  RETURN jsonb_build_object('status', 'credited', 'stores', v_count, 'amount', v_total,
                            'already_skipped', v_already);
END; $$;


-- ============================
-- F-03: process_refund harus mendebit saldo seller
-- ============================
-- Lama: hanya kredit buyer, revoke entitlement, tidak debit seller.
-- Baru: debit seller_ledger per store yang terlibat, idempoten.

CREATE OR REPLACE FUNCTION public.process_refund(_refund_id uuid, _reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.refunds;
  v_order public.orders;
  v_paid bigint;
  v_credit jsonb;
  v_store record;
  v_debit_key text;
  v_debit_existing public.seller_ledger;
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

  -- F-03: Debit seller ledger per store (idempoten)
  FOR v_store IN
    SELECT oi.store_id, SUM(oi.total) AS store_total
      FROM public.order_items oi
     WHERE oi.order_id = r.order_id AND oi.store_id IS NOT NULL
     GROUP BY oi.store_id
  LOOP
    v_debit_key := 'refund:' || r.id::text || ':' || v_store.store_id::text;

    SELECT * INTO v_debit_existing FROM public.seller_ledger WHERE idempotency_key = v_debit_key;
    IF v_debit_existing.id IS NULL THEN
      INSERT INTO public.seller_ledger
        (store_id, direction, amount, gross_amount, platform_fee, source_type, source_id, order_id, reference, note, created_by, idempotency_key)
      VALUES
        (v_store.store_id, 'debit', v_store.store_total, v_store.store_total, 0, 'refund', r.id, r.order_id,
         'REFUND:' || r.refund_number, 'Debit refund ' || r.refund_number, auth.uid(), v_debit_key);
    END IF;
  END LOOP;

  v_credit := public.credit_refund_to_balance(r.id);

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (r.customer_id, 'refund_completed', 'Refund selesai',
          'Dana refund untuk ' || r.refund_number || ' telah dikirim.', 'refund', r.id);

  PERFORM public.write_audit_log('refund.process', 'refund', r.id, to_jsonb(r),
    jsonb_build_object('status','completed','credit',v_credit), _reference, NULL, NULL);

  RETURN jsonb_build_object('status', 'completed', 'credit', v_credit);
END; $$;


-- ============================
-- F-04: Tambah guard pada get_credit_balance
-- ============================
-- Lama: SECURITY DEFINER tanpa cek pemanggil. Siapapun bisa baca saldo user lain.
-- Baru: hanya owner atau staff refunds.view.

CREATE OR REPLACE FUNCTION public.get_credit_balance(_user_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  IF _user_id <> auth.uid() AND NOT public.has_permission(auth.uid(), 'refunds.view') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::bigint
    FROM public.credit_ledger
    WHERE user_id = _user_id
  );
END; $$;


-- ============================
-- F-05: Reversal credit_used pada cancel dan expire
-- ============================

-- cancel_own_order: tambah reversal saldo jika credit_used > 0
CREATE OR REPLACE FUNCTION public.cancel_own_order(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order record; v_reversal_key text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status NOT IN ('awaiting_payment','draft') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  -- F-05: kembalikan saldo yang sudah dipakai
  IF COALESCE(v_order.credit_used, 0) > 0 THEN
    v_reversal_key := 'cancel:' || _order_id::text;
    INSERT INTO public.credit_ledger
      (user_id, direction, amount, source_type, source_id, reference, note, created_by, idempotency_key)
    VALUES
      (v_user, 'credit', v_order.credit_used, 'reversal', _order_id, v_order.order_number,
       'Pengembalian saldo karena pembatalan pesanan ' || v_order.order_number, v_user, v_reversal_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancellation_reason = _reason WHERE id = _order_id;
  UPDATE public.payments SET status = 'cancelled' WHERE order_id = _order_id AND status IN ('pending','waiting_payment','rejected');
  UPDATE public.invoices SET status = 'cancelled' WHERE order_id = _order_id;
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'cancelled', v_user, 'customer', COALESCE(_reason,'Dibatalkan pelanggan.'));
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'order.cancelled', 'Pesanan dibatalkan', 'Pesanan ' || v_order.order_number || ' dibatalkan.', 'order', _order_id);
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
  VALUES (v_user, 'customer', 'order.cancel', 'order', _order_id,
          jsonb_build_object('status','cancelled','credit_reversed', COALESCE(v_order.credit_used,0)), _reason);
  RETURN jsonb_build_object('status','cancelled','credit_reversed', COALESCE(v_order.credit_used,0));
END;
$$;

-- job_expire_orders: tambah reversal saldo jika credit_used > 0
CREATE OR REPLACE FUNCTION public.job_expire_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0; v_start timestamptz := now(); v_reversal_key text;
BEGIN
  FOR r IN
    SELECT id, order_number, user_id, status, COALESCE(credit_used, 0) AS credit_used
      FROM public.orders
     WHERE status IN ('draft','awaiting_payment')
       AND expired_at IS NOT NULL
       AND expired_at < now()
     LIMIT 200
  LOOP
    -- F-05: kembalikan saldo yang sudah dipakai
    IF r.credit_used > 0 THEN
      v_reversal_key := 'expire:' || r.id::text;
      INSERT INTO public.credit_ledger
        (user_id, direction, amount, source_type, source_id, reference, note, idempotency_key)
      VALUES
        (r.user_id, 'credit', r.credit_used, 'reversal', r.id, r.order_number,
         'Pengembalian saldo karena pesanan kedaluwarsa ' || r.order_number, v_reversal_key)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

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


-- ============================
-- F-06: review_refund reject harus reset payment status
-- ============================

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

    -- F-06: Reset payment status dari 'refund_requested' ke 'paid'
    UPDATE public.payments SET status = 'paid'
     WHERE id = r.payment_id AND status = 'refund_requested';
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


-- ============================
-- Izin (identik dengan sebelumnya, dipastikan konsisten)
-- ============================
REVOKE EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.process_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_credit_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_own_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid, text, text) TO authenticated;
