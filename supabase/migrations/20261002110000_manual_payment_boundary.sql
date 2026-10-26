-- Manual transfer uses the existing fulfillment and seller-credit triggers.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

REVOKE INSERT ON public.manual_payment_proofs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  _payment_id uuid, _file_path text, _original_filename text, _mime_type text,
  _size_bytes bigint, _sender_name text, _amount_claimed bigint, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof_id uuid; v_limit bigint;
  v_object record; v_size bigint; v_mime text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR v_pay.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_pay.provider <> 'manual' OR v_pay.method <> 'dana' THEN RAISE EXCEPTION 'MANUAL_ONLY'; END IF;
  IF v_pay.status NOT IN ('waiting_payment','rejected') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_pay.expired_at IS NOT NULL AND v_pay.expired_at <= now() THEN RAISE EXCEPTION 'PAYMENT_EXPIRED'; END IF;
  IF COALESCE((SELECT value FROM public.system_settings WHERE key = 'manual_payment_active'), 'true'::jsonb) = 'false'::jsonb
    OR COALESCE((SELECT value FROM public.system_settings WHERE key = 'feature_manual_payment'), 'true'::jsonb) = 'false'::jsonb
    OR lower(COALESCE((SELECT value #>> '{}' FROM public.system_settings WHERE key = 'manual_payment_method'), 'dana')) <> 'dana'
    OR length(btrim(COALESCE((SELECT value #>> '{}' FROM public.system_settings WHERE key = 'manual_payment_number'), ''))) = 0
    OR length(btrim(COALESCE((SELECT value #>> '{}' FROM public.system_settings WHERE key = 'manual_payment_holder'), ''))) = 0
  THEN RAISE EXCEPTION 'MANUAL_PAYMENT_UNAVAILABLE'; END IF;

  v_limit := public.setting_int('proof_reupload_limit', 3);
  IF v_pay.reupload_count > v_limit THEN RAISE EXCEPTION 'REUPLOAD_LIMIT_REACHED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user OR v_order.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_order.expired_at IS NOT NULL AND v_order.expired_at <= now() THEN RAISE EXCEPTION 'PAYMENT_EXPIRED'; END IF;

  IF _file_path IS NULL OR _file_path NOT LIKE v_user::text || '/' || _payment_id::text || '/%'
    OR _file_path LIKE '%..%' OR _file_path LIKE '%\\%'
    OR _original_filename IS NULL OR length(_original_filename) NOT BETWEEN 1 AND 200
    OR _sender_name IS NULL OR length(btrim(_sender_name)) NOT BETWEEN 2 AND 100
    OR _amount_claimed IS NULL OR _amount_claimed < 0 OR length(COALESCE(_note,'')) > 300
  THEN RAISE EXCEPTION 'INVALID_PROOF'; END IF;
  SELECT metadata INTO v_object FROM storage.objects
    WHERE bucket_id = 'payment-proofs' AND name = _file_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PROOF'; END IF;
  v_size := (v_object.metadata ->> 'size')::bigint;
  v_mime := v_object.metadata ->> 'mimetype';
  IF v_size IS NULL OR v_size NOT BETWEEN 1 AND 5242880
    OR v_mime IS NULL OR v_mime NOT IN ('image/jpeg','image/png','image/webp','application/pdf')
    OR _size_bytes IS DISTINCT FROM v_size OR _mime_type IS DISTINCT FROM v_mime
    OR EXISTS (SELECT 1 FROM public.manual_payment_proofs WHERE file_path = _file_path)
  THEN RAISE EXCEPTION 'INVALID_PROOF'; END IF;

  UPDATE public.manual_payment_proofs SET status = 'superseded'
    WHERE payment_id = _payment_id AND status = 'submitted';
  INSERT INTO public.manual_payment_proofs
    (payment_id, customer_id, file_path, original_filename, mime_type, size_bytes, sender_name, amount_claimed, customer_note)
  VALUES (_payment_id, v_user, _file_path, _original_filename, v_mime, v_size, btrim(_sender_name), _amount_claimed, NULLIF(_note,''))
  RETURNING id INTO v_proof_id;
  UPDATE public.payments SET status = 'waiting_verification', reupload_count = reupload_count + 1 WHERE id = _payment_id;
  UPDATE public.orders SET status = 'payment_under_review' WHERE id = v_order.id;
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (v_order.id, v_order.status, 'payment_under_review', v_user, 'customer', 'Bukti pembayaran diunggah dan sedang diperiksa.');
  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('verify_payment', 'payment', _payment_id, 'Verifikasi pembayaran ' || v_pay.payment_number,
          'Bukti pembayaran manual untuk order ' || v_order.order_number || ' menunggu verifikasi.', 'high')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
  PERFORM public.notify_payment_staff('payment.proof_submitted', 'Bukti pembayaran baru',
    'Order ' || v_order.order_number || ' menunggu verifikasi pembayaran.', _payment_id);
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'payment.proof_submitted', 'Bukti pembayaran diterima',
          'Bukti pembayaran order ' || v_order.order_number || ' sedang diperiksa.', 'order', v_order.id);
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json)
  VALUES (v_user, 'customer', 'payment.proof_submit', 'payment', _payment_id, jsonb_build_object('proof_id', v_proof_id));
  RETURN jsonb_build_object('proof_id', v_proof_id, 'order_id', v_order.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_payment_proof(uuid,text,text,text,bigint,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(uuid,text,text,text,bigint,text,bigint,text) TO authenticated;

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
      v_new_order := 'completed';
      UPDATE public.orders SET status = 'completed', paid_at = now(), completed_at = now() WHERE id = v_order.id;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.completed',
        CASE WHEN v_missing > 0 THEN 'Pembayaran terverifikasi' ELSE 'Produk siap diunduh' END,
        CASE WHEN v_missing > 0 THEN 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Berkas sedang disiapkan tim kami.'
          ELSE 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Produk tersedia di pustaka Anda.' END, 'order', v_order.id);
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
