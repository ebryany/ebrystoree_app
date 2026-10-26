-- 1. Mode pengiriman baru
ALTER TABLE public.digital_products DROP CONSTRAINT IF EXISTS digital_products_delivery_mode_check;
ALTER TABLE public.digital_products ADD CONSTRAINT digital_products_delivery_mode_check
  CHECK (delivery_mode = ANY (ARRAY['shared'::text, 'unique'::text, 'code'::text]));

-- 2. Tabel stok kode/link redeem
CREATE TABLE public.product_stock_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  code text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  status text NOT NULL DEFAULT 'available'
    CHECK (status = ANY (ARRAY['available'::text, 'assigned'::text, 'expired'::text, 'void'::text])),
  assigned_entitlement_id uuid REFERENCES public.digital_entitlements(id) ON DELETE SET NULL,
  assigned_at timestamp with time zone,
  expires_at timestamp with time zone,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX product_stock_codes_unique_code ON public.product_stock_codes (product_id, code);
CREATE INDEX product_stock_codes_available_idx ON public.product_stock_codes (product_id, created_at)
  WHERE status = 'available';
CREATE UNIQUE INDEX product_stock_codes_entitlement_idx ON public.product_stock_codes (assigned_entitlement_id)
  WHERE assigned_entitlement_id IS NOT NULL;

GRANT SELECT ON public.product_stock_codes TO authenticated;
GRANT ALL ON public.product_stock_codes TO service_role;

ALTER TABLE public.product_stock_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_codes_staff_read" ON public.product_stock_codes
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'products.view'));

CREATE POLICY "stock_codes_owner_read" ON public.product_stock_codes
  FOR SELECT TO authenticated
  USING (
    assigned_entitlement_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.digital_entitlements de
       WHERE de.id = product_stock_codes.assigned_entitlement_id
         AND de.user_id = auth.uid()
         AND de.revoked_at IS NULL
    )
  );

CREATE TRIGGER product_stock_codes_updated_at
  BEFORE UPDATE ON public.product_stock_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Hitung stok produk mode code
CREATE OR REPLACE FUNCTION public.recalc_code_stock(_product_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.digital_products p
     SET available_stock = (
       SELECT count(*) FROM public.product_stock_codes c
        WHERE c.product_id = p.id
          AND c.status = 'available'
          AND (c.expires_at IS NULL OR c.expires_at > now())
     )
   WHERE p.id = _product_id AND p.delivery_mode = 'code';
$$;
REVOKE ALL ON FUNCTION public.recalc_code_stock(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_stock_codes_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM public.recalc_code_stock(OLD.product_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM public.recalc_code_stock(NEW.product_id); END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER product_stock_codes_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.product_stock_codes
  FOR EACH ROW EXECUTE FUNCTION public.trg_stock_codes_recalc();

-- 4. Kunci satu kode untuk entitlement
CREATE OR REPLACE FUNCTION public.claim_stock_code(_entitlement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ent record; v_mode text; v_code_id uuid;
BEGIN
  SELECT * INTO v_ent FROM public.digital_entitlements WHERE id = _entitlement_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT delivery_mode INTO v_mode FROM public.digital_products WHERE id = v_ent.product_id;
  IF COALESCE(v_mode, 'shared') <> 'code' THEN RETURN NULL; END IF;

  SELECT id INTO v_code_id FROM public.product_stock_codes
   WHERE assigned_entitlement_id = _entitlement_id LIMIT 1;
  IF v_code_id IS NOT NULL THEN RETURN v_code_id; END IF;

  SELECT id INTO v_code_id FROM public.product_stock_codes
   WHERE product_id = v_ent.product_id
     AND status = 'available'
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF v_code_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.product_stock_codes
     SET status = 'assigned', assigned_entitlement_id = _entitlement_id, assigned_at = now()
   WHERE id = v_code_id;

  RETURN v_code_id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_stock_code(uuid) FROM PUBLIC, anon, authenticated;

-- 5. Pemenuhan per order (dipanggil dari alur pelunasan lewat assign_unique_files_for_order)
CREATE OR REPLACE FUNCTION public.assign_stock_codes_for_order(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e record; v_code uuid; v_missing integer := 0;
BEGIN
  FOR e IN
    SELECT de.id, de.product_id, de.user_id, p.name
      FROM public.digital_entitlements de
      JOIN public.digital_products p ON p.id = de.product_id
     WHERE de.order_id = _order_id
       AND de.revoked_at IS NULL
       AND COALESCE(p.delivery_mode, 'shared') = 'code'
  LOOP
    v_code := public.claim_stock_code(e.id);
    IF v_code IS NULL THEN
      v_missing := v_missing + 1;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('stock_shortage', 'order', _order_id,
              'Stok kode habis untuk ' || e.name,
              'Pesanan sudah lunas tetapi belum ada kode/link tersedia. Menunggu kiriman otomatis atau input manual.',
              'urgent')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_missing;
END; $$;
REVOKE ALL ON FUNCTION public.assign_stock_codes_for_order(uuid) FROM PUBLIC, anon, authenticated;

-- 6. Sisipkan ke alur pelunasan yang sudah ada
CREATE OR REPLACE FUNCTION public.assign_unique_files_for_order(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  v_missing := v_missing + public.assign_stock_codes_for_order(_order_id);
  RETURN v_missing;
END; $$;

-- 7. Pemenuhan antrean saat stok baru masuk
CREATE OR REPLACE FUNCTION public.fulfill_waiting_stock_orders(_product_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e record; v_code uuid; v_done integer := 0;
BEGIN
  FOR e IN
    SELECT de.id, de.user_id, de.order_id, p.name, o.order_number
      FROM public.digital_entitlements de
      JOIN public.digital_products p ON p.id = de.product_id
      JOIN public.orders o ON o.id = de.order_id
     WHERE COALESCE(p.delivery_mode,'shared') = 'code'
       AND de.revoked_at IS NULL
       AND (_product_id IS NULL OR de.product_id = _product_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.product_stock_codes c WHERE c.assigned_entitlement_id = de.id
       )
     ORDER BY de.created_at
  LOOP
    v_code := public.claim_stock_code(e.id);
    IF v_code IS NOT NULL THEN
      v_done := v_done + 1;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (e.user_id, 'order.delivered', 'Akun ' || e.name || ' siap',
              'Link aktivasi untuk pesanan ' || e.order_number || ' sudah tersedia di halaman pesanan Anda.',
              'order', e.order_id);
      UPDATE public.admin_tasks
         SET status = 'done', completed_at = now()
       WHERE task_type = 'stock_shortage' AND source_type = 'order' AND source_id = e.order_id
         AND status IN ('open','in_progress','blocked');
    END IF;
  END LOOP;
  RETURN v_done;
END; $$;
REVOKE ALL ON FUNCTION public.fulfill_waiting_stock_orders(uuid) FROM PUBLIC, anon, authenticated;

-- 8. Ingest dari JioFarm (dipanggil server dengan service role)
CREATE OR REPLACE FUNCTION public.ingest_stock_codes(
  _product_id uuid,
  _codes text[],
  _source text DEFAULT 'jiofarm',
  _expires_at timestamp with time zone DEFAULT NULL,
  _source_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_inserted integer := 0; v_dup integer := 0; c text; v_fulfilled integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.digital_products WHERE id = _product_id AND delivery_mode = 'code') THEN
    RAISE EXCEPTION 'PRODUCT_NOT_CODE_MODE';
  END IF;

  FOREACH c IN ARRAY _codes LOOP
    c := btrim(c);
    CONTINUE WHEN c = '';
    BEGIN
      INSERT INTO public.product_stock_codes (product_id, code, source, source_ref, expires_at)
      VALUES (_product_id, c, COALESCE(_source, 'jiofarm'), _source_ref, _expires_at);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_dup := v_dup + 1;
    END;
  END LOOP;

  IF v_inserted > 0 THEN
    v_fulfilled := public.fulfill_waiting_stock_orders(_product_id);
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'duplicate', v_dup, 'fulfilled', v_fulfilled);
END; $$;
REVOKE ALL ON FUNCTION public.ingest_stock_codes(uuid, text[], text, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;

-- 9. Ringkasan antrean untuk JioFarm
CREATE OR REPLACE FUNCTION public.stock_code_demand()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'product_id', p.id,
      'slug', p.slug,
      'name', p.name,
      'available', (SELECT count(*) FROM public.product_stock_codes c
                     WHERE c.product_id = p.id AND c.status = 'available'
                       AND (c.expires_at IS NULL OR c.expires_at > now())),
      'waiting', (SELECT count(*) FROM public.digital_entitlements de
                   WHERE de.product_id = p.id AND de.revoked_at IS NULL
                     AND NOT EXISTS (SELECT 1 FROM public.product_stock_codes c
                                      WHERE c.assigned_entitlement_id = de.id))
    ) AS row
    FROM public.digital_products p
    WHERE p.delivery_mode = 'code' AND p.deleted_at IS NULL
  ) s;
$$;
REVOKE ALL ON FUNCTION public.stock_code_demand() FROM PUBLIC, anon, authenticated;