-- 1. Schema
ALTER TABLE public.digital_products
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS available_stock integer NOT NULL DEFAULT 0;

ALTER TABLE public.digital_products
  DROP CONSTRAINT IF EXISTS digital_products_delivery_mode_check;
ALTER TABLE public.digital_products
  ADD CONSTRAINT digital_products_delivery_mode_check CHECK (delivery_mode IN ('shared','unique'));

ALTER TABLE public.digital_product_files
  ADD COLUMN IF NOT EXISTS assigned_entitlement_id uuid REFERENCES public.digital_entitlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS digital_product_files_assigned_entitlement_key
  ON public.digital_product_files (assigned_entitlement_id)
  WHERE assigned_entitlement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS digital_product_files_stock_idx
  ON public.digital_product_files (product_id)
  WHERE assigned_entitlement_id IS NULL AND is_active = true;

-- 2. Stock maintenance
CREATE OR REPLACE FUNCTION public.recalc_product_stock(_product_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.digital_products p
     SET available_stock = (
       SELECT count(*) FROM public.digital_product_files f
        WHERE f.product_id = p.id AND f.is_active = true AND f.assigned_entitlement_id IS NULL
     )
   WHERE p.id = _product_id;
$$;
REVOKE EXECUTE ON FUNCTION public.recalc_product_stock(uuid) FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.trg_product_files_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM public.recalc_product_stock(OLD.product_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM public.recalc_product_stock(NEW.product_id); END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS product_files_stock_sync ON public.digital_product_files;
CREATE TRIGGER product_files_stock_sync
AFTER INSERT OR UPDATE OR DELETE ON public.digital_product_files
FOR EACH ROW EXECUTE FUNCTION public.trg_product_files_stock();

UPDATE public.digital_products p
   SET available_stock = (
     SELECT count(*) FROM public.digital_product_files f
      WHERE f.product_id = p.id AND f.is_active = true AND f.assigned_entitlement_id IS NULL
   );

-- 3. Assign one unique file to an entitlement (race-safe)
CREATE OR REPLACE FUNCTION public.assign_unique_file(_entitlement_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ent record; v_mode text; v_file_id uuid;
BEGIN
  SELECT * INTO v_ent FROM public.digital_entitlements WHERE id = _entitlement_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT delivery_mode INTO v_mode FROM public.digital_products WHERE id = v_ent.product_id;
  IF COALESCE(v_mode,'shared') <> 'unique' THEN RETURN NULL; END IF;

  SELECT id INTO v_file_id FROM public.digital_product_files
   WHERE assigned_entitlement_id = _entitlement_id LIMIT 1;
  IF v_file_id IS NOT NULL THEN RETURN v_file_id; END IF;

  SELECT id INTO v_file_id FROM public.digital_product_files
   WHERE product_id = v_ent.product_id AND is_active = true AND assigned_entitlement_id IS NULL
   ORDER BY created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF v_file_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.digital_product_files
     SET assigned_entitlement_id = _entitlement_id, assigned_at = now()
   WHERE id = v_file_id;

  RETURN v_file_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.assign_unique_file(uuid) FROM PUBLIC, authenticated, anon;

-- 4. Checkout: stock guard for unique products
CREATE OR REPLACE FUNCTION public.create_digital_order(_product_id uuid, _quantity integer, _idempotency_key text, _customer_note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  IF COALESCE(v_p.delivery_mode,'shared') = 'unique' THEN
    v_qty := 1;
    IF COALESCE(v_p.available_stock, 0) < 1 THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;
  END IF;

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
          jsonb_build_object('version', v_p.version, 'download_limit', v_p.download_limit,
                             'validity_days', v_p.validity_days, 'delivery_mode', COALESCE(v_p.delivery_mode,'shared')))
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
$function$;

-- 5. Download: unique products only serve their own assigned file
CREATE OR REPLACE FUNCTION public.consume_download(_entitlement_id uuid, _ip text DEFAULT NULL::text, _ua text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_ent record; v_file record; v_mode text; v_file_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_ent FROM public.digital_entitlements WHERE id = _entitlement_id FOR UPDATE;
  IF NOT FOUND OR v_ent.user_id <> v_user THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_ent.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'REVOKED'; END IF;
  IF v_ent.valid_until < now() THEN RAISE EXCEPTION 'EXPIRED'; END IF;
  IF v_ent.download_count >= v_ent.download_limit THEN RAISE EXCEPTION 'LIMIT_REACHED'; END IF;

  SELECT delivery_mode INTO v_mode FROM public.digital_products WHERE id = v_ent.product_id;

  IF COALESCE(v_mode,'shared') = 'unique' THEN
    v_file_id := public.assign_unique_file(_entitlement_id);
    IF v_file_id IS NULL THEN RAISE EXCEPTION 'FILE_UNAVAILABLE'; END IF;
    SELECT * INTO v_file FROM public.digital_product_files WHERE id = v_file_id;
  ELSE
    SELECT * INTO v_file FROM public.digital_product_files
      WHERE product_id = v_ent.product_id AND is_active = true AND assigned_entitlement_id IS NULL
      ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'FILE_UNAVAILABLE'; END IF;
  END IF;

  UPDATE public.digital_entitlements SET download_count = download_count + 1 WHERE id = _entitlement_id;
  INSERT INTO public.download_logs (entitlement_id, user_id, file_id, ip, user_agent)
  VALUES (_entitlement_id, v_user, v_file.id, _ip, _ua);

  RETURN jsonb_build_object('storage_path', v_file.storage_path, 'filename', v_file.original_name,
                            'remaining', v_ent.download_limit - v_ent.download_count - 1);
END;
$function$;

-- 6. Payment approval: lock one file per new entitlement
CREATE OR REPLACE FUNCTION public.assign_unique_files_for_order(_order_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; v_file uuid; v_missing integer := 0;
BEGIN
  FOR e IN
    SELECT de.id, de.product_id, p.name
      FROM public.digital_entitlements de
      JOIN public.digital_products p ON p.id = de.product_id
     WHERE de.order_id = _order_id AND COALESCE(p.delivery_mode,'shared') = 'unique'
  LOOP
    v_file := public.assign_unique_file(e.id);
    IF v_file IS NULL THEN
      v_missing := v_missing + 1;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('stock_shortage', 'order', _order_id,
              'Stok berkas habis untuk ' || e.name,
              'Pesanan sudah lunas tetapi tidak ada berkas unik tersedia. Unggah berkas baru agar pembeli dapat mengunduh.',
              'urgent')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_missing;
END; $$;
REVOKE EXECUTE ON FUNCTION public.assign_unique_files_for_order(uuid) FROM PUBLIC, authenticated, anon;
