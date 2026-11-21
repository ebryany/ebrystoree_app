-- Menghubungkan pengaturan marketplace_seller_auto_approve dan marketplace_partial_refund.
-- Default tetap aman (auto_approve = false, partial_refund = false).

-- 1. Auto-approve seller baru saat marketplace_seller_auto_approve = true.
CREATE OR REPLACE FUNCTION public.apply_as_seller(
  _name text,
  _slug text,
  _description text DEFAULT NULL,
  _contact_phone text DEFAULT NULL,
  _contact_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store public.stores%ROWTYPE;
  v_slug text;
  v_auto_approve boolean := public.setting_bool('marketplace_seller_auto_approve', false);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'INVALID_STORE_NAME';
  END IF;
  v_slug := lower(regexp_replace(btrim(COALESCE(_slug, '')), '[^a-zA-Z0-9-]+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  IF length(v_slug) NOT BETWEEN 3 AND 60 THEN RAISE EXCEPTION 'INVALID_STORE_SLUG'; END IF;

  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR UPDATE;

  IF v_store.id IS NOT NULL THEN
    IF v_store.status = 'rejected' THEN
      IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug AND id <> v_store.id) THEN
        RAISE EXCEPTION 'SLUG_TAKEN';
      END IF;

      PERFORM set_config('app.seller_reapply', 'on', true);

      UPDATE public.stores
         SET name = btrim(_name),
             slug = v_slug,
             description = NULLIF(btrim(COALESCE(_description,'')),''),
             contact_phone = NULLIF(btrim(COALESCE(_contact_phone,'')),''),
             contact_email = NULLIF(btrim(COALESCE(_contact_email,'')),''),
             status = 'pending',
             verification_note = NULL,
             reviewed_by = NULL,
             reviewed_at = NULL
       WHERE id = v_store.id
       RETURNING * INTO v_store;

      PERFORM set_config('app.seller_reapply', 'off', true);

      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('review_seller', 'store', v_store.id,
              'Verifikasi seller (pengajuan ulang): ' || v_store.name,
              'Seller mengajukan ulang setelah ditolak.', 'normal')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_user, 'seller.applied', 'Pengajuan ulang diterima',
              'Toko "' || v_store.name || '" diajukan ulang dan menunggu tinjauan.', 'store', v_store.id);

      PERFORM public.write_audit_log('seller.reapply', 'store', v_store.id, to_jsonb(v_store),
        jsonb_build_object('status','pending'), 'Pengajuan ulang setelah penolakan', NULL, NULL);

      RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', false, 'reapplied', true);
    END IF;

    RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug) THEN RAISE EXCEPTION 'SLUG_TAKEN'; END IF;

  INSERT INTO public.stores (owner_id, name, slug, description, contact_phone, contact_email, status, reviewed_at)
  VALUES (
    v_user,
    btrim(_name),
    v_slug,
    NULLIF(btrim(COALESCE(_description,'')),''),
    NULLIF(btrim(COALESCE(_contact_phone,'')),''),
    NULLIF(btrim(COALESCE(_contact_email,'')),''),
    CASE WHEN v_auto_approve THEN 'active' ELSE 'pending' END,
    CASE WHEN v_auto_approve THEN now() ELSE NULL END
  )
  RETURNING * INTO v_store;

  IF v_auto_approve THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user, 'seller')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_user, 'seller.approved', 'Toko langsung aktif',
            'Toko "' || v_store.name || '" langsung diaktifkan.', 'store', v_store.id);

    PERFORM public.write_audit_log('seller.auto_approve', 'store', v_store.id, NULL,
      jsonb_build_object('name', v_store.name, 'slug', v_store.slug, 'status', 'active'),
      'Aktivasi otomatis seller baru', NULL, NULL);
  ELSE
    INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
    VALUES ('review_seller', 'store', v_store.id,
            'Verifikasi seller: ' || v_store.name,
            'Tinjau pengajuan toko seller baru.', 'normal')
    ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_user, 'seller.applied', 'Pengajuan toko diterima',
            'Toko "' || v_store.name || '" sedang ditinjau tim kami.', 'store', v_store.id);

    PERFORM public.write_audit_log('seller.apply', 'store', v_store.id, NULL,
      jsonb_build_object('name', v_store.name, 'slug', v_store.slug), 'Pengajuan seller baru', NULL, NULL);
  END IF;

  RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user;
    IF v_store.id IS NOT NULL THEN
      RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', true);
    END IF;
    RAISE EXCEPTION 'SLUG_TAKEN';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) TO authenticated;

-- 2. Gate marketplace_partial_refund pada resolve_service_complaint.
DROP FUNCTION IF EXISTS public.resolve_service_complaint(uuid, text, text);
CREATE OR REPLACE FUNCTION public.resolve_service_complaint(
  _order_id uuid,
  _decision text,
  _reason text,
  _refund_amount bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_mso public.marketplace_service_orders%ROWTYPE;
  v_pay record;
  v_refund_id uuid;
  v_work text;
  v_amount bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('resume','refund','partial_refund') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _decision = 'partial_refund' AND NOT public.setting_bool('marketplace_partial_refund', false) THEN
    RAISE EXCEPTION 'PARTIAL_REFUND_DISABLED';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF _decision = 'resume' THEN
    IF NOT public.has_permission(v_user, 'orders.update') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user, 'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT v_mso.complaint_open THEN RAISE EXCEPTION 'NO_COMPLAINT'; END IF;
  IF v_mso.accepted_delivery_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ACCEPTED'; END IF;
  IF _decision = 'resume' THEN
    IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    v_work := v_mso.prior_work_state;
    IF v_work IS NULL OR v_work NOT IN ('awaiting_requirements','in_progress','delivered','revision_requested')
      THEN v_work := 'in_progress'; END IF;
    UPDATE public.marketplace_service_orders SET complaint_open = false, work_state = v_work,
      updated_at = now() WHERE order_id = _order_id;
    INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
      VALUES (_order_id, 'complaint_resumed', v_user, 'admin', jsonb_build_object('reason', btrim(_reason), 'work_state', v_work));
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'service.complaint_resumed', 'Komplain ditindaklanjuti',
        'Komplain pesanan ' || v_order.order_number || ' ditinjau admin. Pekerjaan dilanjutkan sesuai agreement.', 'order', _order_id);
  ELSE
    IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    SELECT * INTO v_pay FROM public.payments WHERE order_id = _order_id AND status = 'paid'
      ORDER BY paid_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;
    v_amount := CASE
      WHEN _decision = 'partial_refund' THEN COALESCE(_refund_amount, 0)
      ELSE v_pay.expected_amount
    END;
    IF v_amount < 1 OR v_amount > v_pay.expected_amount THEN
      RAISE EXCEPTION 'INVALID_REFUND_AMOUNT';
    END IF;
    INSERT INTO public.refunds(order_id, payment_id, requested_by, amount, reason, status, reviewed_by, reviewed_at)
      VALUES (_order_id, v_pay.id, v_order.user_id, v_amount,
        'Keputusan admin atas komplain: ' || btrim(_reason), 'approved', v_user, now())
      RETURNING id INTO v_refund_id;
    UPDATE public.marketplace_service_orders SET complaint_open = false, work_state = 'refunded',
      updated_at = now() WHERE order_id = _order_id;
    INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
      VALUES (_order_id, 'complaint_refund_approved', v_user, 'admin',
        jsonb_build_object('reason', btrim(_reason), 'refund_id', v_refund_id, 'amount', v_amount, 'partial', _decision = 'partial_refund'));
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'service.complaint_refunded', 'Refund komplain disetujui',
        'Komplain pesanan ' || v_order.order_number || ' disetujui untuk pengembalian dana.', 'order', _order_id);
  END IF;
  UPDATE public.admin_tasks SET status = 'done', resolved_at = now(), resolved_by = v_user
    WHERE task_type = 'review_service_complaint' AND source_type = 'order' AND source_id = _order_id
      AND status IN ('open','in_progress','blocked');
  INSERT INTO public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, after_json, reason)
    VALUES (v_user, 'admin', 'marketplace_service.complaint_' || _decision, 'order', _order_id,
      jsonb_build_object('decision', _decision, 'refund_id', v_refund_id), btrim(_reason));
  RETURN jsonb_build_object('status', CASE WHEN _decision = 'resume' THEN 'resumed' ELSE 'refund_approved' END, 'refund_id', v_refund_id);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_service_complaint(uuid, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_complaint(uuid, text, text, bigint) TO authenticated;
