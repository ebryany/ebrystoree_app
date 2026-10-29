-- Variasi produk digital (mis. "1 Bulan" / "3 Bulan") dengan harga sendiri.
--
-- Cakupan: hanya produk delivery_mode = 'shared'. Stok kode/berkas unik masih
-- satu wadah per produk, jadi variasi ditolak di mode 'unique'/'code'.
-- Masa akses & batas unduhan tetap dari produk; fungsi settlement tidak berubah.
--
-- Penulisan variasi hanya lewat RPC set_product_variants (atomic + validasi +
-- reset moderasi). Tabel tidak memberi hak tulis langsung ke authenticated.

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  price bigint NOT NULL CHECK (price >= 0 AND price <= 1000000000),
  discount_price bigint NULL CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price < price)),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx
  ON public.product_variants (product_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_product_name_uniq
  ON public.product_variants (product_id, lower(btrim(name)));

DROP TRIGGER IF EXISTS product_variants_updated_at ON public.product_variants;
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Publik: variasi aktif dari produk yang terlihat (RLS digital_products ikut berlaku
-- di subquery, jadi produk draft/toko suspended otomatis tersembunyi).
DROP POLICY IF EXISTS variants_select_public ON public.product_variants;
CREATE POLICY variants_select_public ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND EXISTS (SELECT 1 FROM public.digital_products dp WHERE dp.id = product_id)
  );

-- Pengelola: admin, atau seller pemilik produk (termasuk variasi nonaktif).
DROP POLICY IF EXISTS variants_select_manage ON public.product_variants;
CREATE POLICY variants_select_manage ON public.product_variants
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.digital_products dp
      WHERE dp.id = product_id AND dp.store_id IS NOT NULL AND dp.store_id = public.my_store_id()
    )
  );

REVOKE ALL ON public.product_variants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT ALL ON public.product_variants TO service_role;

-- ---------------------------------------------------------------------------
-- RPC: ganti seluruh daftar variasi satu produk secara atomic.
-- _variants: [{ "id"?: uuid, "name": text, "price": int, "discount_price"?: int|null,
--              "is_active"?: bool }]. Urutan array = sort_order.
-- Variasi lama yang tidak ada di array dihapus. Id dipertahankan agar keranjang
-- pembeli yang menyimpan variant_id tetap valid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_product_variants(_product_id uuid, _variants jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_p record;
  v_item jsonb;
  v_idx integer := 0;
  v_id uuid;
  v_name text;
  v_price bigint;
  v_discount bigint;
  v_active boolean;
  v_keep uuid[] := ARRAY[]::uuid[];
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_is_admin := public.is_admin(v_user);

  SELECT id, store_id, delivery_mode, moderation_status, status INTO v_p
    FROM public.digital_products
   WHERE id = _product_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF NOT v_is_admin THEN
    IF v_p.store_id IS NULL OR v_p.store_id IS DISTINCT FROM public.my_store_id()
       OR NOT public.has_permission(v_user, 'seller.products.manage') THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  IF _variants IS NULL OR jsonb_typeof(_variants) <> 'array' THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;
  IF jsonb_array_length(_variants) > 20 THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;
  IF jsonb_array_length(_variants) > 0 AND COALESCE(v_p.delivery_mode, 'shared') <> 'shared' THEN
    RAISE EXCEPTION 'VARIANT_UNSUPPORTED';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('n', name, 'p', price, 'd', discount_price, 'a', is_active)
                            ORDER BY sort_order, id), '[]'::jsonb)
    INTO v_before FROM public.product_variants WHERE product_id = _product_id;

  -- Lepas sementara dari indeks unik nama agar rename silang (A<->B) tidak bentrok.
  UPDATE public.product_variants SET name = '~' || id::text WHERE product_id = _product_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_variants) LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;

    v_name := btrim(COALESCE(v_item->>'name', ''));
    IF char_length(v_name) < 1 OR char_length(v_name) > 60 THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;

    IF jsonb_typeof(v_item->'price') <> 'number' THEN RAISE EXCEPTION 'VARIANT_INVALID'; END IF;
    v_price := (v_item->>'price')::numeric;
    IF v_price::numeric <> (v_item->>'price')::numeric OR v_price < 0 OR v_price > 1000000000 THEN
      RAISE EXCEPTION 'VARIANT_INVALID';
    END IF;

    IF v_item->'discount_price' IS NULL OR jsonb_typeof(v_item->'discount_price') = 'null' THEN
      v_discount := NULL;
    ELSIF jsonb_typeof(v_item->'discount_price') = 'number' THEN
      v_discount := (v_item->>'discount_price')::numeric;
      IF v_discount::numeric <> (v_item->>'discount_price')::numeric OR v_discount < 0 OR v_discount >= v_price THEN
        RAISE EXCEPTION 'VARIANT_INVALID';
      END IF;
    ELSE
      RAISE EXCEPTION 'VARIANT_INVALID';
    END IF;

    v_active := COALESCE((v_item->>'is_active')::boolean, true);

    v_id := NULL;
    IF v_item ? 'id' AND jsonb_typeof(v_item->'id') = 'string' THEN
      -- Id hanya dipakai bila memang milik produk ini; selain itu dianggap variasi baru.
      SELECT id INTO v_id FROM public.product_variants
       WHERE id = (v_item->>'id')::uuid AND product_id = _product_id;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE public.product_variants
         SET name = v_name, price = v_price, discount_price = v_discount,
             is_active = v_active, sort_order = v_idx
       WHERE id = v_id;
    ELSE
      INSERT INTO public.product_variants (product_id, name, price, discount_price, is_active, sort_order)
      VALUES (_product_id, v_name, v_price, v_discount, v_active, v_idx)
      RETURNING id INTO v_id;
    END IF;

    v_keep := v_keep || v_id;
    v_idx := v_idx + 1;
  END LOOP;

  DELETE FROM public.product_variants
   WHERE product_id = _product_id AND NOT (id = ANY (v_keep));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('n', name, 'p', price, 'd', discount_price, 'a', is_active)
                            ORDER BY sort_order, id), '[]'::jsonb)
    INTO v_after FROM public.product_variants WHERE product_id = _product_id;

  -- Sama seperti protect_moderation_fields: perubahan harga/variasi produk seller
  -- yang sudah approved wajib direview ulang.
  IF NOT v_is_admin AND v_before IS DISTINCT FROM v_after AND v_p.moderation_status = 'approved' THEN
    UPDATE public.digital_products
       SET moderation_status = 'pending',
           status = CASE WHEN status = 'published' THEN 'draft' ELSE status END
     WHERE id = _product_id;
  END IF;

  IF v_before IS DISTINCT FROM v_after THEN
    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json)
    VALUES (v_user, CASE WHEN v_is_admin THEN 'admin' ELSE 'seller' END, 'product.variants.update',
            'digital_products', _product_id,
            jsonb_build_object('variants', v_before), jsonb_build_object('variants', v_after));
  END IF;

  RETURN jsonb_build_object('count', v_idx);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_product_variants(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_variants(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_digital_order: tambah _variant_id (opsional).
-- Versi 4 argumen di-drop agar tidak ada jalur lama yang melewati aturan variasi;
-- pemanggil lama dengan 4 argumen bernama tetap jalan karena _variant_id DEFAULT NULL.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_digital_order(uuid, integer, text, text);

CREATE OR REPLACE FUNCTION public.create_digital_order(
  _product_id uuid,
  _quantity integer,
  _idempotency_key text,
  _customer_note text DEFAULT NULL::text,
  _variant_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_p record; v_qty integer; v_unit bigint; v_subtotal bigint; v_fee bigint; v_total bigint;
  v_order_id uuid; v_order_number text; v_item_id uuid; v_expiry timestamptz; v_existing uuid;
  v_store record;
  v_variant record;
  v_variant_id uuid;
  v_variant_name text;
  v_item_name text;
  v_meta jsonb;
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

  -- Toko harus ada dan tidak suspended, dan pembeli tidak boleh pemilik toko itu.
  IF v_p.store_id IS NOT NULL THEN
    SELECT id, status, owner_id INTO v_store FROM public.stores WHERE id = v_p.store_id;
    IF v_store.status = 'suspended' THEN RAISE EXCEPTION 'STORE_SUSPENDED'; END IF;
    IF v_store.owner_id = v_user THEN RAISE EXCEPTION 'SELF_PURCHASE_DENIED'; END IF;
  END IF;

  v_qty := GREATEST(1, LEAST(COALESCE(_quantity, 1), 10));

  -- Stock check for unique and code delivery modes
  IF COALESCE(v_p.delivery_mode,'shared') IN ('unique', 'code') THEN
    v_qty := 1;
    IF COALESCE(v_p.available_stock, 0) < 1 THEN RAISE EXCEPTION 'OUT_OF_STOCK'; END IF;
  END IF;

  -- Variasi: harga selalu dari DB. Produk yang punya variasi aktif wajib memilih
  -- salah satu, supaya harga dasar produk tidak bisa dipakai sebagai jalan pintas.
  IF _variant_id IS NOT NULL THEN
    IF COALESCE(v_p.delivery_mode,'shared') <> 'shared' THEN RAISE EXCEPTION 'VARIANT_UNAVAILABLE'; END IF;
    SELECT id, name, price, discount_price INTO v_variant FROM public.product_variants
     WHERE id = _variant_id AND product_id = v_p.id AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'VARIANT_UNAVAILABLE'; END IF;
    v_unit := CASE WHEN v_variant.discount_price IS NOT NULL AND v_variant.discount_price < v_variant.price
                   THEN v_variant.discount_price ELSE v_variant.price END;
    v_variant_id := v_variant.id;
    v_variant_name := v_variant.name;
    v_item_name := v_p.name || ' — ' || v_variant.name;
  ELSE
    IF COALESCE(v_p.delivery_mode,'shared') = 'shared' AND EXISTS (
      SELECT 1 FROM public.product_variants WHERE product_id = v_p.id AND is_active
    ) THEN
      RAISE EXCEPTION 'VARIANT_REQUIRED';
    END IF;
    v_unit := CASE WHEN v_p.discount_price IS NOT NULL AND v_p.discount_price < v_p.price
                   THEN v_p.discount_price ELSE v_p.price END;
    v_item_name := v_p.name;
  END IF;

  v_subtotal := v_unit * v_qty;
  v_fee := public.setting_int('admin_fee', 0);
  v_total := v_subtotal + v_fee;
  v_expiry := now() + (public.setting_int('order_expiry_hours', 24) || ' hours')::interval;

  v_meta := jsonb_build_object('version', v_p.version, 'download_limit', v_p.download_limit,
                               'validity_days', v_p.validity_days, 'delivery_mode', COALESCE(v_p.delivery_mode,'shared'));
  IF v_variant_id IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('variant_id', v_variant_id, 'variant_name', v_variant_name);
  END IF;

  INSERT INTO public.orders (user_id, order_type, status, subtotal, admin_fee, total, customer_note, expired_at)
  VALUES (v_user, 'digital_product', 'awaiting_payment', v_subtotal, v_fee, v_total, NULLIF(_customer_note,''), v_expiry)
  RETURNING id, order_number INTO v_order_id, v_order_number;

  INSERT INTO public.order_items
    (order_id, item_type, product_id, store_id, store_name_snapshot, name_snapshot, sku_snapshot, unit_price, quantity, total, metadata)
  VALUES (v_order_id, 'digital_product', v_p.id, v_p.store_id,
          (SELECT name FROM public.stores WHERE id = v_p.store_id),
          v_item_name, v_p.slug, v_unit, v_qty, v_subtotal, v_meta)
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
          jsonb_build_object('total', v_total, 'product_id', v_p.id, 'quantity', v_qty, 'store_id', v_p.store_id,
                             'variant_id', v_variant_id));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'duplicate', false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_digital_order(uuid, integer, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_digital_order(uuid, integer, text, text, uuid) TO authenticated;
