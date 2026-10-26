
CREATE OR REPLACE FUNCTION public.create_service_order(
  _service_id uuid,
  _package_id uuid,
  _addon_ids uuid[],
  _requirements jsonb,
  _requirements_note text,
  _idempotency_key text,
  _customer_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_s record; v_pkg record; v_addon record;
  v_subtotal bigint := 0; v_fee bigint; v_total bigint;
  v_order_id uuid; v_order_number text; v_expiry timestamptz; v_existing uuid;
  v_addons jsonb := '[]'::jsonb; v_item_id uuid;
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

  SELECT * INTO v_s FROM public.services
    WHERE id = _service_id AND status = 'published' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;

  SELECT * INTO v_pkg FROM public.service_packages
    WHERE id = _package_id AND service_id = _service_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_UNAVAILABLE'; END IF;

  v_subtotal := v_pkg.price;
  v_fee := public.setting_int('admin_fee', 0);
  v_expiry := now() + (public.setting_int('order_expiry_hours', 24) || ' hours')::interval;

  INSERT INTO public.orders (user_id, order_type, status, subtotal, admin_fee, total, customer_note, expired_at)
  VALUES (v_user, 'service', 'awaiting_payment', 0, v_fee, 0, NULLIF(_customer_note,''), v_expiry)
  RETURNING id, order_number INTO v_order_id, v_order_number;

  INSERT INTO public.order_items (order_id, item_type, service_id, package_id, name_snapshot, sku_snapshot, unit_price, quantity, total, metadata)
  VALUES (v_order_id, 'service', v_s.id, v_pkg.id, v_s.name || ' — ' || v_pkg.name, v_s.slug, v_pkg.price, 1, v_pkg.price,
          jsonb_build_object('estimated_days', v_pkg.estimated_days, 'free_revisions', v_pkg.free_revisions, 'sla_hours', v_pkg.sla_hours));

  FOR v_addon IN
    SELECT * FROM public.service_addons
    WHERE service_id = _service_id AND is_active = true AND id = ANY(COALESCE(_addon_ids, ARRAY[]::uuid[]))
    ORDER BY sort_order
  LOOP
    v_subtotal := v_subtotal + v_addon.price;
    v_addons := v_addons || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price', v_addon.price);
    INSERT INTO public.order_items (order_id, item_type, service_id, addon_id, name_snapshot, unit_price, quantity, total)
    VALUES (v_order_id, 'addon', v_s.id, v_addon.id, v_addon.name, v_addon.price, 1, v_addon.price);
  END LOOP;

  v_total := v_subtotal + v_fee;
  UPDATE public.orders SET subtotal = v_subtotal, total = v_total WHERE id = v_order_id;

  INSERT INTO public.service_order_details (order_id, package_snapshot, addons_snapshot, requirements, requirements_note, estimated_days, revision_allowance, requirements_complete)
  VALUES (v_order_id,
          jsonb_build_object('id', v_pkg.id, 'name', v_pkg.name, 'price', v_pkg.price,
                             'estimated_days', v_pkg.estimated_days, 'free_revisions', v_pkg.free_revisions,
                             'sla_hours', v_pkg.sla_hours, 'service_name', v_s.name, 'service_slug', v_s.slug),
          v_addons,
          COALESCE(_requirements, '{}'::jsonb),
          NULLIF(_requirements_note,''),
          COALESCE(v_pkg.estimated_days, 1),
          COALESCE(v_pkg.free_revisions, 0),
          COALESCE(_requirements_note,'') <> '');

  INSERT INTO public.invoices (order_id, customer_snapshot, currency, subtotal, admin_fee, total, status, due_at)
  SELECT v_order_id, jsonb_build_object('name', pr.full_name, 'email', pr.email), 'IDR', v_subtotal, v_fee, v_total, 'issued', v_expiry
  FROM public.profiles pr WHERE pr.id = v_user;

  INSERT INTO public.payments (order_id, user_id, provider, method, status, expected_amount, idempotency_key, expired_at)
  VALUES (v_order_id, v_user, 'manual', 'dana', 'waiting_payment', v_total, _idempotency_key, v_expiry);

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (v_order_id, NULL, 'awaiting_payment', v_user, 'customer', 'Pesanan jasa dibuat, menunggu pembayaran.');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'order.created', 'Pesanan jasa dibuat',
          'Pesanan ' || v_order_number || ' menunggu pembayaran.', 'order', v_order_id);

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json)
  VALUES (v_user, 'customer', 'order.create', 'order', v_order_id,
          jsonb_build_object('total', v_total, 'service_id', v_s.id, 'package_id', v_pkg.id));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'duplicate', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_service_order(uuid, uuid, uuid[], jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_order(uuid, uuid, uuid[], jsonb, text, text, text) TO authenticated;
