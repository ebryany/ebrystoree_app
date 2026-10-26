CREATE TABLE public.digital_order_receipts (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  accepted_by uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pending' AND accepted_by IS NULL AND accepted_at IS NULL)
    OR (status = 'accepted' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);
ALTER TABLE public.digital_order_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.digital_order_receipts FROM anon, authenticated;
GRANT SELECT ON public.digital_order_receipts TO authenticated;
GRANT ALL ON public.digital_order_receipts TO service_role;
CREATE POLICY receipt_owner_read ON public.digital_order_receipts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- Availability is resolved without consuming download quota or allocating another buyer's stock.
CREATE FUNCTION public.digital_receipt_items(_order_id uuid)
RETURNS TABLE(item_id uuid, name text, delivery_mode text, ready boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.id, oi.name_snapshot, COALESCE(oi.metadata->>'delivery_mode', p.delivery_mode, 'shared'),
    COALESCE(de.id IS NOT NULL AND de.product_id = oi.product_id AND de.user_id = o.user_id AND de.revoked_at IS NULL
      AND (de.valid_until IS NULL OR de.valid_until > now())
      AND COALESCE(oi.metadata->>'delivery_mode', p.delivery_mode, 'shared') = p.delivery_mode
      AND CASE p.delivery_mode
        WHEN 'code' THEN EXISTS (SELECT 1 FROM public.product_stock_codes c
          WHERE c.product_id = de.product_id AND c.assigned_entitlement_id = de.id
            AND c.status = 'assigned' AND length(btrim(c.code)) > 0
            AND (c.expires_at IS NULL OR c.expires_at > now()))
        WHEN 'unique' THEN EXISTS (SELECT 1 FROM public.digital_product_files f
          JOIN storage.objects so ON so.bucket_id = 'product-files' AND so.name = f.storage_path
          WHERE f.product_id = de.product_id AND f.assigned_entitlement_id = de.id AND f.is_active)
        WHEN 'shared' THEN EXISTS (SELECT 1 FROM storage.objects so
          WHERE so.bucket_id = 'product-files' AND so.name = (
            SELECT f.storage_path FROM public.digital_product_files f
            WHERE f.product_id = de.product_id AND f.is_active AND f.assigned_entitlement_id IS NULL
            ORDER BY f.created_at DESC LIMIT 1))
        ELSE false END, false)
  FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.digital_products p ON p.id = oi.product_id
  LEFT JOIN public.digital_entitlements de ON de.order_item_id = oi.id AND de.order_id = o.id
  WHERE o.id = _order_id AND oi.item_type = 'digital_product';
$$;
REVOKE ALL ON FUNCTION public.digital_receipt_items(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_my_digital_receipt(_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; r public.digital_order_receipts; v_items jsonb; v_ready boolean; v_refund boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.order_type <> 'digital_product' THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.digital_order_receipts WHERE order_id = o.id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_agg(to_jsonb(i)), count(*) > 0 AND bool_and(i.ready) INTO v_items, v_ready
    FROM public.digital_receipt_items(o.id) i;
  SELECT EXISTS (SELECT 1 FROM public.refunds WHERE order_id = o.id
    AND status IN ('requested','under_review','information_requested','approved','processing')) INTO v_refund;
  RETURN jsonb_build_object('status',r.status,'accepted_at',r.accepted_at,'items',COALESCE(v_items,'[]'::jsonb),
    'can_confirm',o.status = 'paid' AND r.status = 'pending' AND v_ready AND NOT v_refund
      AND EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id AND status = 'paid'));
END; $$;
REVOKE ALL ON FUNCTION public.get_my_digital_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_digital_receipt(uuid) TO authenticated;

CREATE FUNCTION public.confirm_digital_receipt(_order_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders; r public.digital_order_receipts; v_ready boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id <> auth.uid() THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.order_type <> 'digital_product' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  SELECT * INTO r FROM public.digital_order_receipts WHERE order_id = o.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF r.status = 'accepted' AND o.status = 'completed' THEN
    RETURN jsonb_build_object('status','accepted','duplicate',true);
  END IF;
  IF o.status <> 'paid' OR r.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE order_id = o.id AND status = 'paid')
    THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE order_id = o.id
    AND status IN ('requested','under_review','information_requested','approved','processing'))
    THEN RAISE EXCEPTION 'REFUND_ACTIVE'; END IF;
  PERFORM 1 FROM public.digital_entitlements WHERE order_id = o.id FOR UPDATE;
  SELECT count(*) > 0 AND bool_and(i.ready) INTO v_ready FROM public.digital_receipt_items(o.id) i;
  IF v_ready IS NOT TRUE THEN RAISE EXCEPTION 'DELIVERY_NOT_READY'; END IF;
  UPDATE public.digital_order_receipts SET status = 'accepted', accepted_by = auth.uid(), accepted_at = now() WHERE order_id = o.id;
  UPDATE public.orders SET status = 'completed', completed_at = now() WHERE id = o.id;
  INSERT INTO public.order_status_histories(order_id,previous_status,new_status,actor_id,actor_type,public_note)
    VALUES(o.id,o.status,'completed',auth.uid(),'customer','Pembeli mengonfirmasi seluruh produk diterima dan sesuai.');
  INSERT INTO public.notifications(recipient_id,type,title,message,related_type,related_id)
    VALUES(o.user_id,'order.receipt_accepted','Penerimaan dikonfirmasi','Anda mengonfirmasi produk pada pesanan ' || o.order_number || ' diterima dan sesuai.','order',o.id);
  PERFORM public.write_audit_log('order.receipt_accepted','order',o.id,
    jsonb_build_object('status',o.status),jsonb_build_object('status','completed','accepted_by',auth.uid()),NULL,NULL,NULL);
  RETURN jsonb_build_object('status','accepted','duplicate',false);
END; $$;
REVOKE ALL ON FUNCTION public.confirm_digital_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_digital_receipt(uuid) TO authenticated;

CREATE FUNCTION public.get_my_stock_code(_entitlement_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.digital_entitlements; v_code text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO e FROM public.digital_entitlements WHERE id = _entitlement_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF e.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'REVOKED'; END IF;
  IF e.valid_until IS NOT NULL AND e.valid_until <= now() THEN RAISE EXCEPTION 'EXPIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items oi JOIN public.digital_products p ON p.id = oi.product_id
    WHERE oi.id = e.order_item_id AND oi.order_id = e.order_id AND oi.product_id = e.product_id
      AND p.delivery_mode = 'code' AND COALESCE(oi.metadata->>'delivery_mode', p.delivery_mode) = 'code')
    THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  SELECT c.code INTO v_code FROM public.product_stock_codes c
    WHERE c.product_id = e.product_id AND c.assigned_entitlement_id = e.id AND c.status = 'assigned'
      AND length(btrim(c.code)) > 0 AND (c.expires_at IS NULL OR c.expires_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_READY'; END IF;
  RETURN jsonb_build_object('code',v_code);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_stock_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_stock_code(uuid) TO authenticated;

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
        AND (metadata ->> 'size')::bigint BETWEEN 1 AND 5242880
        AND metadata ->> 'mimetype' IN ('image/jpeg','image/png','image/webp','application/pdf'))
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
    IF v_order.order_type = 'digital_product' THEN
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

  IF v_order.order_type = 'digital_product' THEN
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

CREATE OR REPLACE FUNCTION public.review_refund(_refund_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.refunds; v_new text; v_order public.orders; v_restore text;
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

  SELECT * INTO v_order FROM public.orders WHERE id = r.order_id FOR UPDATE;

  IF _decision = 'approve' THEN
    UPDATE public.orders SET status = 'refund_processing' WHERE id = r.order_id;
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (r.order_id, v_order.status, 'refund_processing', auth.uid(), 'finance', 'Refund disetujui, menunggu pengiriman dana');
  ELSIF _decision = 'reject' THEN
    v_restore := CASE WHEN EXISTS (SELECT 1 FROM public.digital_order_receipts
      WHERE order_id = r.order_id AND status = 'pending') THEN 'paid' ELSE 'completed' END;
    UPDATE public.orders SET status = v_restore WHERE id = r.order_id AND status = 'refund_requested';
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
    VALUES (r.order_id, v_order.status, v_restore, auth.uid(), 'finance', 'Pengajuan refund ditolak', _reason);

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
REVOKE EXECUTE ON FUNCTION public.review_refund(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_refund(uuid,text,text) TO authenticated;
