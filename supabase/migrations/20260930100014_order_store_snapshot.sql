-- ============================================================================
-- MARKETPLACE — PROMPT 18: Order Seller Snapshot & Line Ownership
--
-- Tujuan: setiap baris order tahu PENJUALNYA (store), dengan SNAPSHOT nama toko
--         saat transaksi (agar riwayat tetap valid walau toko berubah).
--
-- Keputusan: satu seller per order (M-02) — tapi model disiapkan per-baris agar
--            tidak buntu bila kelak multi-seller.
--
-- Sifat: ADITIF. Kolom nullable → backfill → index. Order lama tetap valid.
-- Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop kolom store_id/store_name_snapshot, index, policy.
-- ============================================================================

-- 1) Kolom kepemilikan pada baris order --------------------------------------
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_name_snapshot text;

CREATE INDEX IF NOT EXISTS idx_order_items_store ON public.order_items (store_id);

-- 2) Backfill: baris order lama → produk → toko pemiliknya -------------------
UPDATE public.order_items oi
   SET store_id = dp.store_id,
       store_name_snapshot = s.name
  FROM public.digital_products dp
  JOIN public.stores s ON s.id = dp.store_id
 WHERE oi.product_id = dp.id
   AND oi.store_id IS NULL;

-- 3) RLS: seller melihat baris order milik tokonya ---------------------------
DROP POLICY IF EXISTS order_items_select_seller_own ON public.order_items;
CREATE POLICY order_items_select_seller_own ON public.order_items
  FOR SELECT TO authenticated
  USING (
    store_id IS NOT NULL
    AND store_id = public.my_store_id()
  );

-- 4) Perbarui create_digital_order: isi store snapshot -----------------------
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
    WHERE id = _product_id AND status = 'published' AND deleted_at IS NULL
      AND moderation_status = 'approved';
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

  -- Snapshot: simpan store pemilik produk pada baris order.
  INSERT INTO public.order_items
    (order_id, item_type, product_id, store_id, store_name_snapshot, name_snapshot, sku_snapshot, unit_price, quantity, total, metadata)
  VALUES (v_order_id, 'digital_product', v_p.id, v_p.store_id,
          (SELECT name FROM public.stores WHERE id = v_p.store_id),
          v_p.name, v_p.slug, v_unit, v_qty, v_subtotal,
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
          jsonb_build_object('total', v_total, 'product_id', v_p.id, 'quantity', v_qty, 'store_id', v_p.store_id));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'duplicate', false);
END;
$function$;
