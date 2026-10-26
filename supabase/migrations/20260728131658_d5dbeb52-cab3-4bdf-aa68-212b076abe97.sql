-- ================= helper =================
CREATE OR REPLACE FUNCTION public.setting_int(_key text, _default bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::bigint FROM public.system_settings WHERE key = _key), _default);
$$;
REVOKE EXECUTE ON FUNCTION public.setting_int(text, bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_payment_staff(_type text, _title text, _msg text, _related_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  SELECT DISTINCT ur.user_id, _type, _title, _msg, 'payment', _related_id
  FROM public.user_roles ur WHERE ur.role IN ('finance','admin','super_admin');
$$;
REVOKE EXECUTE ON FUNCTION public.notify_payment_staff(text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ================= checkout produk digital =================
CREATE OR REPLACE FUNCTION public.create_digital_order(
  _product_id uuid, _quantity integer, _idempotency_key text, _customer_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_p record; v_qty integer; v_unit bigint; v_subtotal bigint; v_fee bigint; v_total bigint;
  v_order_id uuid; v_order_number text; v_item_id uuid; v_expiry timestamptz; v_existing uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.create') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;

  SELECT o.id INTO v_existing FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.idempotency_key = _idempotency_key AND o.user_id = v_user;
  IF v_existing IS NOT NULL THEN
    SELECT order_number INTO v_order_number FROM public.orders WHERE id = v_existing;
    RETURN jsonb_build_object('order_id', v_existing, 'order_number', v_order_number, 'duplicate', true);
  END IF;

  SELECT * INTO v_p FROM public.digital_products
    WHERE id = _product_id AND status = 'published' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'; END IF;

  v_qty := GREATEST(1, LEAST(COALESCE(_quantity, 1), 10));
  v_unit := CASE WHEN v_p.discount_price IS NOT NULL AND v_p.discount_price < v_p.price
                 THEN v_p.discount_price ELSE v_p.price END;
  v_subtotal := v_unit * v_qty;
  v_fee := public.setting_int('admin_fee', 0);
  v_total := v_subtotal + v_fee;
  v_expiry := now() + (public.setting_int('order_expiry_hours', 24) || ' hours')::interval;

  INSERT INTO public.orders (user_id, order_type, status, subtotal, admin_fee, total, customer_note, expired_at)
  VALUES (v_user, 'digital_product', 'awaiting_payment', v_subtotal, v_fee, v_total, NULLIF(_customer_note,''), v_expiry)
  RETURNING id, order_number INTO v_order_id, v_order_number;

  INSERT INTO public.order_items (order_id, item_type, product_id, name_snapshot, sku_snapshot, unit_price, quantity, total, metadata)
  VALUES (v_order_id, 'digital_product', v_p.id, v_p.name, v_p.slug, v_unit, v_qty, v_subtotal,
          jsonb_build_object('version', v_p.version, 'download_limit', v_p.download_limit, 'validity_days', v_p.validity_days))
  RETURNING id INTO v_item_id;

  INSERT INTO public.invoices (order_id, customer_snapshot, currency, subtotal, admin_fee, total, status, due_at)
  SELECT v_order_id, jsonb_build_object('name', pr.full_name, 'email', pr.email), 'IDR', v_subtotal, v_fee, v_total, 'issued', v_expiry
  FROM public.profiles pr WHERE pr.id = v_user;

  INSERT INTO public.payments (order_id, user_id, provider, method, status, expected_amount, idempotency_key, expired_at)
  VALUES (v_order_id, v_user, 'manual', 'dana', 'waiting_payment', v_total, _idempotency_key, v_expiry);

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (v_order_id, NULL, 'awaiting_payment', v_user, 'customer', 'Pesanan dibuat, menunggu pembayaran.');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'order.created', 'Pesanan dibuat',
          'Pesanan ' || v_order_number || ' menunggu pembayaran.', 'order', v_order_id);

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json)
  VALUES (v_user, 'customer', 'order.create', 'order', v_order_id,
          jsonb_build_object('total', v_total, 'product_id', v_p.id, 'quantity', v_qty));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'duplicate', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_digital_order(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_digital_order(uuid, integer, text, text) TO authenticated;

-- ================= submit bukti pembayaran =================
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  _payment_id uuid, _file_path text, _original_filename text, _mime_type text,
  _size_bytes bigint, _sender_name text, _amount_claimed bigint, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof_id uuid; v_limit bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND OR v_pay.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_pay.status NOT IN ('waiting_payment','rejected') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_pay.expired_at IS NOT NULL AND v_pay.expired_at < now() THEN RAISE EXCEPTION 'PAYMENT_EXPIRED'; END IF;

  v_limit := public.setting_int('proof_reupload_limit', 3);
  IF v_pay.reupload_count > v_limit THEN RAISE EXCEPTION 'REUPLOAD_LIMIT_REACHED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;

  UPDATE public.manual_payment_proofs SET status = 'superseded'
    WHERE payment_id = _payment_id AND status = 'submitted';

  INSERT INTO public.manual_payment_proofs
    (payment_id, customer_id, file_path, original_filename, mime_type, size_bytes, sender_name, amount_claimed, customer_note)
  VALUES (_payment_id, v_user, _file_path, _original_filename, _mime_type, _size_bytes, _sender_name, _amount_claimed, NULLIF(_note,''))
  RETURNING id INTO v_proof_id;

  UPDATE public.payments
    SET status = 'waiting_verification', reupload_count = reupload_count + 1
    WHERE id = _payment_id;

  UPDATE public.orders SET status = 'payment_under_review' WHERE id = v_order.id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (v_order.id, v_order.status, 'payment_under_review', v_user, 'customer', 'Bukti pembayaran diunggah dan sedang diperiksa.');

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('verify_payment', 'payment', _payment_id,
          'Verifikasi pembayaran ' || v_pay.payment_number,
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
REVOKE EXECUTE ON FUNCTION public.submit_payment_proof(uuid, text, text, text, bigint, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(uuid, text, text, text, bigint, text, bigint, text) TO authenticated;

-- ================= verifikasi pembayaran manual =================
CREATE OR REPLACE FUNCTION public.verify_manual_payment(
  _payment_id uuid, _decision text, _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof uuid;
  v_new_pay text; v_new_order text; v_role text;
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

    IF v_order.order_type = 'digital_product' THEN
      v_new_order := 'completed';
      UPDATE public.orders SET status = 'completed', paid_at = now(), completed_at = now() WHERE id = v_order.id;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.completed', 'Produk siap diunduh',
              'Pembayaran order ' || v_order.order_number || ' terverifikasi. Produk tersedia di pustaka Anda.', 'order', v_order.id);
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
          CASE WHEN _decision = 'approved' THEN 'Pembayaran terverifikasi.' ELSE 'Pembayaran belum dapat diterima.' END, _reason);

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
    WHERE task_type = 'verify_payment' AND source_type = 'payment' AND source_id = _payment_id
      AND status IN ('open','in_progress','blocked');

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_user, v_role, 'payment.' || _decision, 'payment', _payment_id,
          jsonb_build_object('status', v_pay.status), jsonb_build_object('status', v_new_pay), _reason);

  RETURN jsonb_build_object('payment_status', v_new_pay, 'order_status', v_new_order);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text, text) TO authenticated;

-- ================= pembatalan order =================
CREATE OR REPLACE FUNCTION public.cancel_own_order(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status NOT IN ('awaiting_payment','draft') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancellation_reason = _reason WHERE id = _order_id;
  UPDATE public.payments SET status = 'cancelled' WHERE order_id = _order_id AND status IN ('pending','waiting_payment','rejected');
  UPDATE public.invoices SET status = 'cancelled' WHERE order_id = _order_id;
  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (_order_id, v_order.status, 'cancelled', v_user, 'customer', COALESCE(_reason,'Dibatalkan pelanggan.'));
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'order.cancelled', 'Pesanan dibatalkan', 'Pesanan ' || v_order.order_number || ' dibatalkan.', 'order', _order_id);
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
  VALUES (v_user, 'customer', 'order.cancel', 'order', _order_id, jsonb_build_object('status','cancelled'), _reason);
  RETURN jsonb_build_object('status','cancelled');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_own_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_order(uuid, text) TO authenticated;

-- ================= pengajuan refund =================
CREATE OR REPLACE FUNCTION public.request_refund(_order_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_order record; v_pay record; v_id uuid; v_window bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
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

-- ================= konsumsi kuota unduhan =================
CREATE OR REPLACE FUNCTION public.consume_download(_entitlement_id uuid, _ip text DEFAULT NULL, _ua text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_ent record; v_file record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_ent FROM public.digital_entitlements WHERE id = _entitlement_id FOR UPDATE;
  IF NOT FOUND OR v_ent.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_ent.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'REVOKED'; END IF;
  IF v_ent.valid_until < now() THEN RAISE EXCEPTION 'EXPIRED'; END IF;
  IF v_ent.download_count >= v_ent.download_limit THEN RAISE EXCEPTION 'LIMIT_REACHED'; END IF;

  SELECT * INTO v_file FROM public.digital_product_files
    WHERE product_id = v_ent.product_id AND is_active = true ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FILE_UNAVAILABLE'; END IF;

  UPDATE public.digital_entitlements SET download_count = download_count + 1 WHERE id = _entitlement_id;
  INSERT INTO public.download_logs (entitlement_id, user_id, file_id, ip, user_agent)
  VALUES (_entitlement_id, v_user, v_file.id, _ip, _ua);

  RETURN jsonb_build_object('storage_path', v_file.storage_path, 'filename', v_file.original_name,
                            'remaining', v_ent.download_limit - v_ent.download_count - 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.consume_download(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_download(uuid, text, text) TO authenticated;