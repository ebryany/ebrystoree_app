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
    v_new_order := 'completed';
    UPDATE public.orders SET status = 'completed', paid_at = now(), completed_at = now() WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'order.completed',
            CASE WHEN v_missing > 0 THEN 'Pembayaran diterima' ELSE 'Produk siap diunduh' END,
            CASE WHEN v_missing > 0
                 THEN 'Pembayaran QRIS order ' || v_order.order_number || ' diterima. Berkas sedang disiapkan tim kami.'
                 ELSE 'Pembayaran QRIS order ' || v_order.order_number || ' diterima. Produk tersedia di pustaka Anda.' END,
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

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES ('qris_enabled', 'true'::jsonb, 'Aktifkan metode pembayaran QRIS otomatis', true)
ON CONFLICT (key) DO NOTHING;