CREATE OR REPLACE FUNCTION public.verify_manual_payment(_payment_id uuid, _decision text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof uuid;
  v_new_pay text; v_new_order text; v_role text; v_is_academic boolean; v_missing integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision NOT IN ('approved','rejected','reupload_requested') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _decision = 'approved' THEN
    IF NOT public.has_permission(v_user,'payments.verify') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user,'payments.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_pay.status <> 'waiting_verification' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;
  SELECT id INTO v_proof FROM public.manual_payment_proofs
    WHERE payment_id = _payment_id AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 1;
  SELECT string_agg(role::text, ',') INTO v_role FROM public.user_roles WHERE user_id = v_user;

  SELECT EXISTS (SELECT 1 FROM public.service_order_details
                  WHERE order_id = v_order.id AND academic_category_id IS NOT NULL)
    INTO v_is_academic;

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
              CASE WHEN v_missing > 0
                   THEN 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Berkas sedang disiapkan tim kami.'
                   ELSE 'Pembayaran order ' || v_order.order_number || ' terverifikasi. Produk tersedia di pustaka Anda.' END,
              'order', v_order.id);
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
    WHERE task_type = 'verify_payment' AND source_type = 'payment' AND source_id = _payment_id
      AND status IN ('open','in_progress','blocked');

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_user, v_role, 'payment.' || _decision, 'payment', _payment_id,
          jsonb_build_object('status', v_pay.status), jsonb_build_object('status', v_new_pay), _reason);

  RETURN jsonb_build_object('payment_status', v_new_pay, 'order_status', v_new_order, 'stock_missing', v_missing);
END;
$function$;