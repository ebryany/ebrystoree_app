ALTER TABLE public.orders DROP CONSTRAINT orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('digital_product','service','marketplace_service'));
ALTER TABLE public.order_items DROP CONSTRAINT order_items_item_type_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_item_type_check
  CHECK (item_type IN ('digital_product','service','addon','fee','marketplace_service'));
ALTER TABLE public.order_items ADD COLUMN marketplace_service_id uuid REFERENCES public.marketplace_services(id);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_marketplace_service_check
  CHECK ((item_type = 'marketplace_service') = (marketplace_service_id IS NOT NULL));

CREATE FUNCTION public.quote_marketplace_service_order(_service_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_listing public.marketplace_services%ROWTYPE;
  v_store public.stores%ROWTYPE; v_category public.categories%ROWTYPE; v_fee bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF public.has_permission(v_user, 'orders.create') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF COALESCE((SELECT value = 'true'::jsonb FROM public.system_settings WHERE key = 'feature_checkout'), true) IS NOT TRUE
    THEN RAISE EXCEPTION 'CHECKOUT_DISABLED'; END IF;
  SELECT * INTO v_listing FROM public.marketplace_services WHERE id = _service_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE id = v_listing.store_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  IF v_store.owner_id = v_user THEN RAISE EXCEPTION 'SELF_PURCHASE_DENIED'; END IF;
  SELECT * INTO v_category FROM public.categories WHERE id = v_listing.category_id
    AND kind = 'service' AND is_active AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  -- Timestamp arithmetic must remain representable even for legacy agreements.
  IF (v_listing.agreement->>'durationDays')::bigint NOT BETWEEN 1 AND 36500 THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  v_fee := public.setting_int('admin_fee', 0);
  IF v_fee NOT BETWEEN 0 AND 1000000000 THEN RAISE EXCEPTION 'INVALID_CHECKOUT_SETTINGS'; END IF;
  RETURN jsonb_build_object('id', v_listing.id, 'name', v_listing.name, 'price', v_listing.price,
    'agreement', v_listing.agreement, 'version', v_listing.version,
    'store', jsonb_build_object('name', v_store.name, 'slug', v_store.slug),
    'category', jsonb_build_object('name', v_category.name, 'slug', v_category.slug),
    'adminFee', v_fee, 'total', v_listing.price + v_fee);
END; $$;
REVOKE ALL ON FUNCTION public.quote_marketplace_service_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_marketplace_service_order(uuid) TO authenticated;

-- The old two-argument hard stop stays inaccessible; it cannot bypass consent or stale checks.
REVOKE ALL ON FUNCTION public.create_marketplace_service_order(uuid,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.create_marketplace_service_order(
  _service_id uuid, _idempotency_key text, _expected_version integer, _expected_total bigint,
  _requirements text, _agreement_accepted boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_listing public.marketplace_services%ROWTYPE;
  v_store public.stores%ROWTYPE; v_existing record; v_order_id uuid; v_order_number text;
  v_fee bigint; v_total bigint; v_expiry timestamptz; v_hours bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF public.has_permission(v_user, 'orders.create') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _service_id IS NULL OR _idempotency_key IS NULL OR _idempotency_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF _agreement_accepted IS NOT TRUE THEN RAISE EXCEPTION 'AGREEMENT_REQUIRED'; END IF;
  IF _requirements IS NULL OR length(btrim(_requirements)) NOT BETWEEN 10 AND 5000 THEN RAISE EXCEPTION 'REQUIREMENTS_REQUIRED'; END IF;

  -- Global payment keys require a global lock, not a lock scoped to the buyer.
  PERFORM pg_advisory_xact_lock(710004, hashtext(_idempotency_key));
  SELECT o.id, o.order_number, o.user_id, o.order_type, m.service_id INTO v_existing
    FROM public.payments p JOIN public.orders o ON o.id = p.order_id
    LEFT JOIN public.marketplace_service_orders m ON m.order_id = o.id
    WHERE p.idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF v_existing.user_id <> v_user OR v_existing.order_type <> 'marketplace_service'
      OR v_existing.service_id IS DISTINCT FROM _service_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number, 'duplicate', true);
  END IF;
  IF COALESCE((SELECT value = 'true'::jsonb FROM public.system_settings WHERE key = 'feature_checkout'), true) IS NOT TRUE
    THEN RAISE EXCEPTION 'CHECKOUT_DISABLED'; END IF;

  SELECT s.* INTO v_store FROM public.stores s JOIN public.marketplace_services m ON m.store_id = s.id
    WHERE m.id = _service_id FOR SHARE OF s;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  IF v_store.owner_id = v_user THEN RAISE EXCEPTION 'SELF_PURCHASE_DENIED'; END IF;
  SELECT * INTO v_listing FROM public.marketplace_services WHERE id = _service_id FOR SHARE;
  IF NOT FOUND OR v_listing.status <> 'approved' OR v_listing.store_id <> v_store.id THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  PERFORM 1 FROM public.categories WHERE id = v_listing.category_id AND kind = 'service'
    AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  IF (v_listing.agreement->>'durationDays')::bigint NOT BETWEEN 1 AND 36500 THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  v_fee := public.setting_int('admin_fee', 0);
  v_hours := public.setting_int('order_expiry_hours', 24);
  IF v_fee NOT BETWEEN 0 AND 1000000000 OR v_hours NOT BETWEEN 1 AND 8760 THEN RAISE EXCEPTION 'INVALID_CHECKOUT_SETTINGS'; END IF;
  v_total := v_listing.price + v_fee;
  IF _expected_version IS NULL OR _expected_version <> v_listing.version OR _expected_total IS DISTINCT FROM v_total
    THEN RAISE EXCEPTION 'STALE_QUOTE'; END IF;
  v_expiry := now() + (v_hours || ' hours')::interval;

  INSERT INTO public.orders(user_id, order_type, status, subtotal, admin_fee, total, expired_at)
    VALUES(v_user, 'marketplace_service', 'awaiting_payment', v_listing.price, v_fee, v_total, v_expiry)
    RETURNING id, order_number INTO v_order_id, v_order_number;
  INSERT INTO public.order_items(order_id, item_type, marketplace_service_id, store_id, store_name_snapshot,
    name_snapshot, unit_price, quantity, total, metadata)
    VALUES(v_order_id, 'marketplace_service', v_listing.id, v_store.id, v_store.name,
      v_listing.name, v_listing.price, 1, v_listing.price,
      jsonb_build_object('agreement_version', v_listing.version, 'category_name',
        (SELECT name FROM public.categories WHERE id = v_listing.category_id)));
  INSERT INTO public.marketplace_service_orders(order_id, service_id, store_id, agreement, agreement_version,
    requirements, revision_limit)
    VALUES(v_order_id, v_listing.id, v_store.id, v_listing.agreement, v_listing.version,
      jsonb_build_object('note', btrim(_requirements)), (v_listing.agreement->>'revisionLimit')::integer);
  INSERT INTO public.invoices(order_id, customer_snapshot, currency, subtotal, admin_fee, total, status, due_at)
    VALUES(v_order_id, COALESCE((SELECT jsonb_build_object('name',full_name,'email',email)
      FROM public.profiles WHERE id = v_user), '{}'::jsonb), 'IDR', v_listing.price, v_fee, v_total, 'issued', v_expiry);
  INSERT INTO public.payments(order_id, user_id, provider, method, status, expected_amount, idempotency_key, expired_at)
    VALUES(v_order_id, v_user, 'manual', 'dana', 'waiting_payment', v_total, _idempotency_key, v_expiry);
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
    VALUES(v_order_id, 'order_created', v_user, 'buyer', jsonb_build_object('agreement_version',v_listing.version,'agreement_accepted',true));
  INSERT INTO public.order_status_histories(order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES(v_order_id, NULL, 'awaiting_payment', v_user, 'customer', 'Pesanan jasa dibuat, menunggu pembayaran.');
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES(v_user, 'order.created', 'Pesanan jasa dibuat', 'Pesanan ' || v_order_number || ' menunggu pembayaran.', 'order', v_order_id);
  INSERT INTO public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, after_json)
    VALUES(v_user, 'customer', 'marketplace_service.order_create', 'order', v_order_id,
      jsonb_build_object('service_id',v_listing.id,'store_id',v_store.id,'agreement_version',v_listing.version,'total',v_total,'agreement_accepted',true));
  RETURN jsonb_build_object('order_id',v_order_id,'order_number',v_order_number,'duplicate',false);
END; $$;
REVOKE ALL ON FUNCTION public.create_marketplace_service_order(uuid,text,integer,bigint,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_service_order(uuid,text,integer,bigint,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_paid_marketplace_service(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mso public.marketplace_service_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_ORDER_CONTRACT_MISSING'; END IF;
  IF v_mso.agreement ? 'durationDays' IS NOT TRUE
    OR jsonb_typeof(jsonb_extract_path(v_mso.agreement, 'durationDays')) <> 'number' THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  UPDATE public.marketplace_service_orders SET
    ready_at = CASE WHEN requirements_approved_at IS NOT NULL AND ready_at IS NULL THEN now() ELSE ready_at END,
    due_at = CASE WHEN requirements_approved_at IS NOT NULL AND ready_at IS NULL
      THEN now() + ((agreement->>'durationDays')::int || ' days')::interval ELSE due_at END,
    work_state = CASE WHEN requirements_approved_at IS NOT NULL AND work_state = 'awaiting_requirements'
      THEN 'in_progress' ELSE work_state END, updated_at = now()
  WHERE order_id = _order_id;
END; $$;
REVOKE ALL ON FUNCTION public.activate_paid_marketplace_service(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_service_requirements(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_store public.stores%ROWTYPE;
  v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR SHARE;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_mso.store_id <> v_store.id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.complaint_open THEN RAISE EXCEPTION 'COMPLAINT_ACTIVE'; END IF;
  IF v_mso.work_state <> 'awaiting_requirements' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.requirements IS NULL OR length(btrim(v_mso.requirements->>'note')) < 10 THEN RAISE EXCEPTION 'REQUIREMENTS_REQUIRED'; END IF;
  IF v_mso.agreement ? 'durationDays' IS NOT TRUE
    OR jsonb_typeof(jsonb_extract_path(v_mso.agreement, 'durationDays')) <> 'number' THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  UPDATE public.marketplace_service_orders SET requirements_approved_at = now(),
    ready_at = now(), due_at = now() + ((agreement->>'durationDays')::int || ' days')::interval,
    work_state = 'in_progress', updated_at = now() WHERE order_id = _order_id RETURNING * INTO v_mso;
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
    VALUES(_order_id, 'requirements_approved', v_user, 'seller',
      jsonb_build_object('requirements_version',v_mso.requirements_version,'due_at',v_mso.due_at));
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES(v_order.user_id, 'service.requirements_approved', 'Kebutuhan disetujui seller',
      'Seller menyetujui kebutuhan pesanan ' || v_order.order_number || '. Pengerjaan mengikuti kesepakatan yang Anda setujui.', 'order', _order_id);
  RETURN jsonb_build_object('status',v_mso.work_state,'due_at',v_mso.due_at);
END; $$;
REVOKE ALL ON FUNCTION public.approve_service_requirements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_service_requirements(uuid) TO authenticated;
