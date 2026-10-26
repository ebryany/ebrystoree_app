-- Guard finansial jasa marketplace. Urutan wajib framework A-08: guard ini harus ada
-- sebelum jalur apa pun dapat membuat order jasa seller terbayar. Semua redefinisi
-- mempertahankan cabang digital/akademik/operator persis seperti migration sebelumnya;
-- hanya cabang marketplace_service dan guard penolakan yang ditambahkan.

-- Helper internal dispatcher: menyalakan ready/due saat order lunas dan requirements
-- sudah disetujui. Gagal keras bila kontrak order jasa tidak ada.
CREATE FUNCTION public.activate_paid_marketplace_service(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mso public.marketplace_service_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_ORDER_CONTRACT_MISSING'; END IF;
  IF v_mso.agreement ? 'durationDays' IS NOT TRUE
    OR jsonb_typeof(jsonb_extract_path_text(v_mso.agreement, 'durationDays')) <> 'number' THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  UPDATE public.marketplace_service_orders SET
    ready_at = CASE WHEN requirements_approved_at IS NOT NULL AND ready_at IS NULL THEN now() ELSE ready_at END,
    due_at = CASE WHEN requirements_approved_at IS NOT NULL AND ready_at IS NULL
      THEN now() + ((jsonb_extract_path_text(agreement, 'durationDays'))::int || ' days')::interval ELSE due_at END,
    work_state = CASE WHEN requirements_approved_at IS NOT NULL AND work_state = 'awaiting_requirements'
      THEN 'in_progress' ELSE work_state END, updated_at = now()
  WHERE order_id = _order_id;
END; $$;
REVOKE ALL ON FUNCTION public.activate_paid_marketplace_service(uuid) FROM PUBLIC, anon, authenticated;

-- Cabang marketplace_service eksplisit: tanpa acceptance buyer valid, credit ditolak
-- termasuk untuk pemanggil service-role. Jalur non-digital legacy tidak berubah.
CREATE OR REPLACE FUNCTION public.credit_seller_earnings(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; r record; v_key text; v_count int := 0; v_total bigint := 0;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.order_type = 'digital_product' THEN
    IF NOT EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = o.id) THEN
      IF o.status = 'completed' AND EXISTS (SELECT 1 FROM public.seller_ledger
        WHERE order_id = o.id AND direction = 'credit' AND source_type = 'sale') THEN
        RETURN jsonb_build_object('status','already_credited','legacy',true);
      END IF;
      RAISE EXCEPTION 'RECEIPT_REQUIRED';
    END IF;
    IF o.status <> 'completed' OR NOT EXISTS (SELECT 1 FROM public.digital_order_receipts
      WHERE order_id = o.id AND status = 'accepted' AND accepted_by = o.user_id AND accepted_at IS NOT NULL)
      THEN RAISE EXCEPTION 'RECEIPT_REQUIRED'; END IF;
  ELSIF o.order_type = 'marketplace_service' THEN
    IF NOT EXISTS (SELECT 1 FROM public.marketplace_service_orders
      WHERE order_id = o.id AND accepted_delivery_id IS NOT NULL AND accepted_at IS NOT NULL
        AND work_state = 'accepted' AND complaint_open = false)
      THEN RAISE EXCEPTION 'ACCEPTANCE_REQUIRED'; END IF;
  ELSIF o.status NOT IN ('paid','completed') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id AND status = 'paid')
    THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE order_id = o.id
    AND status IN ('requested','under_review','information_requested','approved','processing'))
    THEN RAISE EXCEPTION 'REFUND_ACTIVE'; END IF;
  FOR r IN SELECT oi.store_id, SUM(oi.total)::bigint AS gross FROM public.order_items oi
    WHERE oi.order_id = o.id AND oi.store_id IS NOT NULL GROUP BY oi.store_id
  LOOP
    IF r.gross <= 0 THEN CONTINUE; END IF;
    v_key := 'sale:' || o.id::text || ':' || r.store_id::text;
    INSERT INTO public.seller_ledger
      (store_id,direction,amount,gross_amount,platform_fee,source_type,order_id,reference,note,idempotency_key)
    VALUES (r.store_id,'credit',r.gross,r.gross,0,'sale',o.id,'ORDER:' || o.id::text,
      'Pendapatan penjualan dilepas',v_key)
    ON CONFLICT (idempotency_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; v_total := v_total + r.gross; END IF;
  END LOOP;
  RETURN jsonb_build_object('status',CASE WHEN v_count = 0 THEN 'already_credited' ELSE 'credited' END,
    'stores',v_count,'amount',v_total);
END; $$;
REVOKE ALL ON FUNCTION public.credit_seller_earnings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) TO service_role;

-- Jasa marketplace tidak pernah dikredit oleh transisi status order; release hanya
-- terjadi di accept_service_delivery setelah buyer menerima delivery terakhir.
CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_type = 'marketplace_service' THEN
    RETURN NEW;
  ELSIF NEW.order_type = 'digital_product' THEN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
      AND EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = NEW.id AND status = 'accepted') THEN
      PERFORM public.credit_seller_earnings(NEW.id);
    END IF;
  ELSIF NEW.status IN ('paid','completed') AND OLD.status IS DISTINCT FROM 'paid'
    AND OLD.status IS DISTINCT FROM 'completed' THEN
    PERFORM public.credit_seller_earnings(NEW.id);
  END IF;
  RETURN NEW;
END; $$;

-- Cabang jasa marketplace pada verifikasi manual, sebelum fallback operator.
CREATE OR REPLACE FUNCTION public.verify_manual_payment(_payment_id uuid, _decision text, _reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof uuid; v_proof_row record;
  v_new_pay text; v_new_order text; v_role text; v_is_academic boolean; v_missing integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approved','rejected','reupload_requested') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _decision = 'approved' THEN
    IF NOT public.has_permission(v_user,'payments.verify') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user,'payments.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_pay.provider <> 'manual' OR v_pay.method <> 'dana' THEN RAISE EXCEPTION 'MANUAL_ONLY'; END IF;
  IF v_pay.status <> 'waiting_verification' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'payment_under_review' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  SELECT * INTO v_proof_row FROM public.manual_payment_proofs
    WHERE payment_id = _payment_id AND customer_id = v_pay.user_id AND status = 'submitted'
    ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROOF_REQUIRED'; END IF;
  v_proof := v_proof_row.id;
  IF _decision = 'approved' THEN
    IF v_proof_row.amount_claimed IS DISTINCT FROM v_pay.expected_amount THEN RAISE EXCEPTION 'AMOUNT_MISMATCH'; END IF;
    IF v_proof_row.file_path NOT LIKE v_pay.user_id::text || '/%'
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name = v_proof_row.file_path
        AND (jsonb_extract_path_text(metadata, 'size'))::bigint BETWEEN 1 AND 5242880
        AND jsonb_extract_path_text(metadata, 'mimetype') IN ('image/jpeg','image/png','image/webp','application/pdf'))
    THEN RAISE EXCEPTION 'INVALID_PROOF'; END IF;
  END IF;
  SELECT string_agg(role::text, ',') INTO v_role FROM public.user_roles WHERE user_id = v_user;
  SELECT EXISTS (SELECT 1 FROM public.service_order_details
    WHERE order_id = v_order.id AND academic_category_id IS NOT NULL) INTO v_is_academic;

  IF _decision = 'approved' THEN
    v_new_pay := 'paid';
    UPDATE public.payments SET status = 'paid', paid_amount = expected_amount, paid_at = now() WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'approved' WHERE id = v_proof;
    UPDATE public.invoices SET status = 'paid', paid_at = now() WHERE order_id = v_order.id;
    INSERT INTO public.digital_entitlements (user_id, order_item_id, order_id, product_id, file_version, download_limit, valid_until)
    SELECT v_order.user_id, oi.id, v_order.id, oi.product_id, dp.version,
      COALESCE(dp.download_limit, 5), now() + (COALESCE(dp.validity_days, 365) || ' days')::interval
    FROM public.order_items oi JOIN public.digital_products dp ON dp.id = oi.product_id
    WHERE oi.order_id = v_order.id AND oi.item_type = 'digital_product'
    ON CONFLICT (order_item_id) DO NOTHING;
    v_missing := public.assign_unique_files_for_order(v_order.id);
    IF v_order.order_type = 'marketplace_service' THEN
      v_new_order := 'paid';
      UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;
      PERFORM public.activate_paid_marketplace_service(v_order.id);
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      SELECT s.owner_id, 'order.paid', 'Pembayaran jasa diterima',
        'Pesanan jasa ' || v_order.order_number || ' telah lunas. Setujui requirements pembeli sebelum mulai bekerja.', 'order', v_order.id
      FROM public.marketplace_service_orders m JOIN public.stores s ON s.id = m.store_id
      WHERE m.order_id = v_order.id;
    ELSIF v_order.order_type = 'digital_product' THEN
      v_new_order := 'paid';
      INSERT INTO public.digital_order_receipts(order_id) VALUES(v_order.id) ON CONFLICT (order_id) DO NOTHING;
      UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.paid',
        CASE WHEN v_missing > 0 THEN 'Pembayaran terverifikasi' ELSE 'Akses produk disiapkan' END,
        CASE WHEN v_missing > 0 THEN 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Berkas sedang disiapkan tim kami.'
          ELSE 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Periksa produk di pustaka Anda, lalu konfirmasikan penerimaan pada detail pesanan.' END, 'order', v_order.id);
    ELSIF v_is_academic THEN
      v_new_order := 'academic_review';
      UPDATE public.orders SET status = 'academic_review', paid_at = now() WHERE id = v_order.id;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('academic_scope_review', 'order', v_order.id, 'Periksa kebutuhan akademik ' || v_order.order_number,
        'Pesanan akademik sudah lunas dan menunggu pemeriksaan kebutuhan sebelum penugasan.', 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'academic.payment_verified', 'Pembayaran telah diverifikasi',
        'Kebutuhan tugas pada pesanan ' || v_order.order_number || ' sedang diperiksa oleh tim.', 'order', v_order.id);
    ELSE
      v_new_order := 'waiting_assignment';
      UPDATE public.orders SET status = 'waiting_assignment', paid_at = now() WHERE id = v_order.id;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('assign_operator', 'order', v_order.id, 'Tugaskan operator untuk ' || v_order.order_number,
        'Order jasa sudah lunas dan menunggu penugasan operator.', 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.paid', 'Pembayaran terverifikasi',
        'Order ' || v_order.order_number || ' menunggu penugasan operator.', 'order', v_order.id);
    END IF;
  ELSIF _decision = 'rejected' THEN
    v_new_pay := 'rejected'; v_new_order := 'awaiting_payment';
    UPDATE public.payments SET status = 'rejected' WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'rejected' WHERE id = v_proof;
    UPDATE public.orders SET status = 'awaiting_payment' WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'payment.rejected', 'Bukti pembayaran ditolak',
      'Bukti pembayaran order ' || v_order.order_number || ' ditolak: ' || _reason, 'order', v_order.id);
  ELSE
    v_new_pay := 'waiting_payment'; v_new_order := 'awaiting_payment';
    UPDATE public.payments SET status = 'waiting_payment' WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'rejected' WHERE id = v_proof;
    UPDATE public.orders SET status = 'awaiting_payment' WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'payment.reupload_requested', 'Unggah ulang bukti pembayaran',
      'Mohon unggah ulang bukti pembayaran order ' || v_order.order_number || ': ' || _reason, 'order', v_order.id);
  END IF;
  INSERT INTO public.payment_verifications (payment_id, proof_id, verifier_id, previous_status, new_status, decision, reason)
  VALUES (_payment_id, v_proof, v_user, v_pay.status, v_new_pay, _decision, _reason);
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
  VALUES (v_order.id, v_order.status, v_new_order, v_user, 'finance',
    CASE WHEN _decision = 'approved' THEN 'Pembayaran telah diverifikasi.' ELSE 'Pembayaran belum dapat diterima.' END, _reason);
  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
    WHERE task_type = 'verify_payment' AND source_type = 'payment' AND source_id = _payment_id AND status IN ('open','in_progress','blocked');
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_user, v_role, 'payment.' || _decision, 'payment', _payment_id,
    jsonb_build_object('status', v_pay.status), jsonb_build_object('status', v_new_pay), _reason);
  RETURN jsonb_build_object('payment_status', v_new_pay, 'order_status', v_new_order, 'stock_missing', v_missing);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.verify_manual_payment(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_manual_payment(uuid,text,text) TO authenticated;

-- Cabang jasa marketplace pada settlement gateway, sebelum fallback operator.
CREATE OR REPLACE FUNCTION public.settle_gateway_payment(
  _payment_id uuid,
  _provider text,
  _provider_ref text,
  _paid_amount bigint,
  _method text DEFAULT 'qris'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pay record; v_order record; v_new_order text; v_is_academic boolean; v_missing integer := 0;
BEGIN
  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_pay.status = 'paid' THEN
    RETURN jsonb_build_object('payment_status', 'paid', 'already_settled', true);
  END IF;

  IF v_pay.status NOT IN ('waiting_payment', 'pending', 'processing', 'waiting_verification') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;

  IF _paid_amount < v_pay.expected_amount THEN RAISE EXCEPTION 'AMOUNT_MISMATCH'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;

  SELECT EXISTS (SELECT 1 FROM public.service_order_details
                  WHERE order_id = v_order.id AND academic_category_id IS NOT NULL)
    INTO v_is_academic;

  UPDATE public.payments
     SET status = 'paid',
         provider = COALESCE(_provider, provider),
         method = COALESCE(_method, method),
         paid_amount = _paid_amount,
         paid_at = now(),
         external_transaction_id = COALESCE(_provider_ref, external_transaction_id)
   WHERE id = _payment_id;

  UPDATE public.invoices SET status = 'paid', paid_at = now() WHERE order_id = v_order.id;

  INSERT INTO public.digital_entitlements (user_id, order_item_id, order_id, product_id, file_version, download_limit, valid_until)
  SELECT v_order.user_id, oi.id, v_order.id, oi.product_id, dp.version,
         COALESCE(dp.download_limit, 5), now() + (COALESCE(dp.validity_days, 365) || ' days')::interval
  FROM public.order_items oi JOIN public.digital_products dp ON dp.id = oi.product_id
  WHERE oi.order_id = v_order.id AND oi.item_type = 'digital_product'
  ON CONFLICT (order_item_id) DO NOTHING;

  v_missing := public.assign_unique_files_for_order(v_order.id);

  IF v_order.order_type = 'marketplace_service' THEN
    v_new_order := 'paid';
    UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;
    PERFORM public.activate_paid_marketplace_service(v_order.id);
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    SELECT s.owner_id, 'order.paid', 'Pembayaran jasa diterima',
      'Pesanan jasa ' || v_order.order_number || ' telah lunas. Setujui requirements pembeli sebelum mulai bekerja.', 'order', v_order.id
    FROM public.marketplace_service_orders m JOIN public.stores s ON s.id = m.store_id
    WHERE m.order_id = v_order.id;
  ELSIF v_order.order_type = 'digital_product' THEN
    v_new_order := 'paid';
    INSERT INTO public.digital_order_receipts(order_id) VALUES(v_order.id) ON CONFLICT (order_id) DO NOTHING;
    UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'order.paid',
            CASE WHEN v_missing > 0 THEN 'Pembayaran diterima' ELSE 'Akses produk disiapkan' END,
            CASE WHEN v_missing > 0
                 THEN 'Pembayaran QRIS order ' || v_order.order_number || ' diterima. Berkas sedang disiapkan tim kami.'
                 ELSE 'Pembayaran QRIS order ' || v_order.order_number || ' diterima. Periksa produk di pustaka Anda, lalu konfirmasikan penerimaan pada detail pesanan.' END,
            'order', v_order.id);
  ELSIF v_is_academic THEN
    v_new_order := 'academic_review';
    UPDATE public.orders SET status = 'academic_review', paid_at = now() WHERE id = v_order.id;
    INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
    VALUES ('academic_scope_review', 'order', v_order.id, 'Periksa kebutuhan akademik ' || v_order.order_number,
            'Pesanan akademik sudah lunas dan menunggu pemeriksaan kebutuhan sebelum penugasan.', 'high')
    ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'academic.payment_verified', 'Pembayaran diterima',
            'Kebutuhan tugas pada pesanan ' || v_order.order_number || ' sedang diperiksa oleh tim.', 'order', v_order.id);
  ELSE
    v_new_order := 'waiting_assignment';
    UPDATE public.orders SET status = 'waiting_assignment', paid_at = now() WHERE id = v_order.id;
    INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
    VALUES ('assign_operator', 'order', v_order.id, 'Tugaskan operator untuk ' || v_order.order_number,
            'Order jasa sudah lunas dan menunggu penugasan operator.', 'high')
    ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'order.paid', 'Pembayaran diterima',
            'Order ' || v_order.order_number || ' menunggu penugasan operator.', 'order', v_order.id);
  END IF;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (v_order.id, v_order.status, v_new_order, NULL, 'system', 'Pembayaran otomatis diterima melalui gateway.');

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = 'Dibayar otomatis via gateway'
    WHERE task_type = 'verify_payment' AND source_type = 'payment' AND source_id = _payment_id
      AND status IN ('open','in_progress','blocked');

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (NULL, 'system', 'payment.gateway_settled', 'payment', _payment_id,
          jsonb_build_object('status', v_pay.status),
          jsonb_build_object('status', 'paid', 'provider', _provider, 'reference', _provider_ref),
          'Konfirmasi gateway pembayaran');

  RETURN jsonb_build_object('payment_status', 'paid', 'order_status', v_new_order, 'stock_missing', v_missing, 'already_settled', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_gateway_payment(uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_gateway_payment(uuid, text, text, bigint, text) TO service_role;

-- Sinkronisasi refund jasa: penolakan memulihkan state tersimpan, bukan fallback completed.
CREATE OR REPLACE FUNCTION public.process_refund(_refund_id uuid, _reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; o public.orders; v_order_id uuid; v_paid bigint; v_credit jsonb; s record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(),'refunds.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _reference IS NULL OR length(btrim(_reference)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status = 'completed' THEN RETURN jsonb_build_object('status','completed','duplicate',true); END IF;
  IF r.status NOT IN ('approved','processing') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  -- ponytail: seller refund processing supports full single-store orders; allocate partial/mixed-credit refunds before widening.
  IF EXISTS (SELECT 1 FROM public.order_items WHERE order_id = o.id AND store_id IS NOT NULL) THEN
    IF r.amount <> o.total OR o.credit_used > 0 OR
      (SELECT count(DISTINCT store_id) FROM public.order_items WHERE order_id = o.id) > 1 OR
      EXISTS (SELECT 1 FROM public.seller_ledger WHERE order_id = o.id AND source_type = 'sale' AND platform_fee <> 0)
      THEN RAISE EXCEPTION 'REFUND_ALLOCATION_REQUIRED'; END IF;
  END IF;
  UPDATE public.refunds SET status = 'completed', processing_reference = _reference, processed_at = now() WHERE id = r.id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.refunds WHERE order_id = o.id AND status = 'completed';
  UPDATE public.payments SET status = CASE WHEN v_paid >= o.total THEN 'refunded' ELSE 'partially_refunded' END WHERE id = r.payment_id;
  UPDATE public.orders SET status = 'refunded' WHERE id = o.id;
  UPDATE public.marketplace_service_orders SET complaint_open = false, work_state = 'refunded', updated_at = now()
    WHERE order_id = o.id;
  INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note)
    VALUES(o.id,o.status,'refunded',auth.uid(),'finance','Dana refund telah dikirim');
  UPDATE public.digital_entitlements SET revoked_at = now() WHERE order_id = o.id AND revoked_at IS NULL;
  FOR s IN SELECT store_id, SUM(CASE WHEN direction = 'credit' AND source_type = 'sale' THEN amount
      WHEN direction = 'debit' AND source_type IN ('refund','reversal') THEN -amount ELSE 0 END)::bigint AS remaining
    FROM public.seller_ledger WHERE order_id = o.id GROUP BY store_id
  LOOP
    IF s.remaining > 0 THEN
      INSERT INTO public.seller_ledger
        (store_id,direction,amount,gross_amount,platform_fee,source_type,source_id,order_id,reference,note,created_by,idempotency_key)
      VALUES(s.store_id,'debit',s.remaining,s.remaining,0,'refund',r.id,o.id,'REFUND:' || r.refund_number,
        'Debit refund ' || r.refund_number,auth.uid(),'refund:' || r.id::text || ':' || s.store_id::text)
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
  END LOOP;
  v_credit := public.credit_refund_to_balance(r.id);
  INSERT INTO public.notifications(recipient_id,type,title,message,related_type,related_id)
    VALUES(r.customer_id,'refund_completed','Refund selesai','Dana refund untuk ' || r.refund_number || ' telah dikirim.','refund',r.id);
  PERFORM public.write_audit_log('refund.process','refund',r.id,to_jsonb(r),
    jsonb_build_object('status','completed','credit',v_credit),_reference,NULL,NULL);
  RETURN jsonb_build_object('status','completed','credit',v_credit,'duplicate',false);
END; $$;
REVOKE ALL ON FUNCTION public.process_refund(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_refund(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_refund(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; o public.orders; v_order_id uuid; v_new text; v_restore text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approve','reject','request_info') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF _decision = 'reject' THEN
    IF NOT public.has_permission(auth.uid(),'refunds.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(auth.uid(),'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id = _refund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF r.status NOT IN ('requested','under_review','information_requested') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  v_new := CASE _decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'information_requested' END;
  UPDATE public.refunds SET status = v_new,reviewed_by = auth.uid(),reviewed_at = now(),decision_note = _reason WHERE id = r.id;
  IF _decision = 'approve' THEN
    UPDATE public.orders SET status = 'refund_processing' WHERE id = o.id;
    INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note)
      VALUES(o.id,o.status,'refund_processing',auth.uid(),'finance','Refund disetujui, menunggu pengiriman dana');
  ELSIF _decision = 'reject' THEN
    IF EXISTS (SELECT 1 FROM public.marketplace_service_orders WHERE order_id = o.id) THEN
      SELECT CASE WHEN prior_order_status IN ('paid','completed') THEN prior_order_status ELSE 'paid' END
        INTO v_restore FROM public.marketplace_service_orders WHERE order_id = o.id FOR UPDATE;
      UPDATE public.marketplace_service_orders SET complaint_open = false,
        work_state = CASE WHEN work_state = 'complaint_open' THEN
          CASE WHEN prior_work_state IN ('awaiting_requirements','in_progress','delivered','revision_requested')
            THEN prior_work_state ELSE 'in_progress' END
        ELSE work_state END, updated_at = now()
        WHERE order_id = o.id;
    ELSIF EXISTS (SELECT 1 FROM public.digital_order_receipts WHERE order_id = o.id) THEN
      SELECT CASE status WHEN 'pending' THEN 'paid' ELSE 'completed' END INTO v_restore
        FROM public.digital_order_receipts WHERE order_id = o.id;
    ELSE
      SELECT previous_status INTO v_restore FROM public.order_status_histories
        WHERE order_id = o.id AND new_status = 'refund_requested' ORDER BY created_at DESC LIMIT 1;
      v_restore := COALESCE(v_restore,'completed');
    END IF;
    UPDATE public.payments SET status = 'paid' WHERE id = r.payment_id AND status = 'refund_requested';
    UPDATE public.orders SET status = v_restore WHERE id = o.id AND status = 'refund_requested';
    INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note,internal_note)
      VALUES(o.id,o.status,v_restore,auth.uid(),'finance','Pengajuan refund ditolak',_reason);
  END IF;
  INSERT INTO public.notifications(recipient_id,type,title,message,related_type,related_id)
    VALUES(r.customer_id,'refund_' || v_new,'Status refund diperbarui',
      'Pengajuan refund ' || r.refund_number || ' kini berstatus ' || v_new || '.','refund',r.id);
  IF _decision <> 'request_info' THEN
    UPDATE public.admin_tasks SET status = 'completed',completed_at = now(),note = _reason
      WHERE source_type = 'refund' AND source_id = r.id AND status <> 'completed';
  END IF;
  PERFORM public.write_audit_log('refund.' || _decision,'refund',r.id,to_jsonb(r),jsonb_build_object('status',v_new),_reason,NULL,NULL);
  RETURN jsonb_build_object('status',v_new);
END; $$;
REVOKE ALL ON FUNCTION public.review_refund(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid,text,text) TO authenticated;

-- Refund langsung atas order jasa setelah acceptance diblokir sampai JDO-03
-- diputuskan; komplain pra-acceptance tetap jalur review-nya.
CREATE OR REPLACE FUNCTION public.request_refund(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order record; v_pay record; v_id uuid; v_window bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_service_orders
    WHERE order_id = _order_id AND accepted_delivery_id IS NOT NULL)
    THEN RAISE EXCEPTION 'SERVICE_POST_ACCEPTANCE_REFUND_UNAVAILABLE'; END IF;
  IF v_order.status NOT IN ('paid','waiting_assignment','assigned','queued','in_progress','waiting_customer_review','completed')
    THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  v_window := public.setting_int('refund_window_days', 7);
  IF v_order.paid_at IS NULL OR v_order.paid_at < now() - (v_window || ' days')::interval
    THEN RAISE EXCEPTION 'REFUND_WINDOW_CLOSED'; END IF;

  SELECT * INTO v_pay FROM public.payments WHERE order_id = _order_id AND status = 'paid' ORDER BY paid_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;

  INSERT INTO public.refunds (order_id, payment_id, customer_id, amount, reason)
  VALUES (_order_id, v_pay.id, v_user, v_pay.paid_amount, _reason) RETURNING id INTO v_id;

  UPDATE public.orders SET status = 'refund_requested' WHERE id = _order_id;
  UPDATE public.payments SET status = 'refund_requested' WHERE id = v_pay.id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'refund_requested', v_user, 'customer', 'Pengajuan refund dikirim.');

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_refund', 'refund', v_id, 'Review refund order ' || v_order.order_number, _reason, 'high')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

  PERFORM public.notify_payment_staff('refund.requested', 'Permintaan refund baru',
    'Order ' || v_order.order_number || ' mengajukan refund.', v_pay.id);

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
  VALUES (v_user, 'customer', 'refund.request', 'refund', v_id, jsonb_build_object('amount', v_pay.paid_amount), _reason);

  RETURN jsonb_build_object('refund_id', v_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text) TO authenticated;
