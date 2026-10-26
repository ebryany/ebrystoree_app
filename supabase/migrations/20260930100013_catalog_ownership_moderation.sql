-- ============================================================================
-- MARKETPLACE — PROMPT 11–12: Kepemilikan Katalog + Moderasi
--
-- Tujuan: produk digital punya PEMILIK (store). Seller hanya mengelola produk
--         miliknya; produk wajib moderasi sebelum publish.
--
-- Aturan AGENTS.md: kolom non-null ownership → nullable → backfill → verify →
--         constrain. Migrasi ADITIF.
--
-- Keputusan: produk legacy → "platform store" (M-03). Karena belum ada store
--         platform, kita buat satu store khusus platform (owner NULL ditandai
--         is_platform) — kolom seller_id tetap nullable sampai backfill selesai.
--
-- Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop policy/trigger/kolom/moderation fields (lihat catatan akhir).
-- ============================================================================

-- 1) Store platform (untuk produk legacy) ------------------------------------
-- stores.owner_id NOT NULL → longgarkan agar store platform boleh tanpa owner.
ALTER TABLE public.stores ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_platform boolean NOT NULL DEFAULT false;

-- Unique owner: hanya untuk non-platform (platform boleh tanpa owner).
DROP INDEX IF EXISTS stores_owner_unique;
CREATE UNIQUE INDEX IF NOT EXISTS stores_owner_unique
  ON public.stores (owner_id) WHERE owner_id IS NOT NULL;

INSERT INTO public.stores (owner_id, name, slug, description, status, is_platform)
VALUES (NULL, 'Ebrystore Official', 'ebrystore-official',
        'Produk resmi dari tim Ebrystore.', 'active', true)
ON CONFLICT (slug) DO NOTHING;

-- 2) Kolom kepemilikan pada produk (nullable dulu) ---------------------------
ALTER TABLE public.digital_products
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS moderation_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_digital_products_store ON public.digital_products (store_id);
CREATE INDEX IF NOT EXISTS idx_digital_products_moderation ON public.digital_products (moderation_status);

-- 3) Backfill: semua produk lama → platform store, moderasi approved ---------
UPDATE public.digital_products
   SET store_id = (SELECT id FROM public.stores WHERE is_platform = true LIMIT 1),
       moderation_status = 'approved'
 WHERE store_id IS NULL;

-- 4) RLS: seller hanya menyentuh produk miliknya -----------------------------
DROP POLICY IF EXISTS products_select_seller_own ON public.digital_products;
CREATE POLICY products_select_seller_own ON public.digital_products
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND store_id IS NOT NULL
    AND store_id = public.my_store_id()
  );

DROP POLICY IF EXISTS products_write_seller_own ON public.digital_products;
CREATE POLICY products_write_seller_own ON public.digital_products
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id IS NOT NULL
    AND store_id = public.my_store_id()
    AND public.has_permission(auth.uid(), 'seller.products.manage')
  );

DROP POLICY IF EXISTS products_update_seller_own ON public.digital_products;
CREATE POLICY products_update_seller_own ON public.digital_products
  FOR UPDATE TO authenticated
  USING (store_id = public.my_store_id() AND public.has_permission(auth.uid(), 'seller.products.manage'))
  WITH CHECK (store_id = public.my_store_id());

-- 5) Trigger: paksa moderasi saat seller publish -----------------------------
-- Seller tidak boleh publish langsung; produk seller harus lewat moderasi.
CREATE OR REPLACE FUNCTION public.enforce_product_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Bila bukan admin platform, dan mencoba publish tanpa moderasi approved,
  -- turunkan ke draft dan tandai pending.
  IF NEW.status = 'published'
     AND NEW.moderation_status <> 'approved'
     AND NOT public.is_admin(auth.uid()) THEN
    NEW.status := 'draft';
    IF NEW.moderation_status NOT IN ('pending','rejected') THEN
      NEW.moderation_status := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS products_enforce_moderation ON public.digital_products;
CREATE TRIGGER products_enforce_moderation
  BEFORE INSERT OR UPDATE ON public.digital_products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_moderation();

-- 6) RPC: seller ajukan produk untuk moderasi --------------------------------
CREATE OR REPLACE FUNCTION public.submit_product_for_review(_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.digital_products; v_store uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;

  SELECT * INTO v_p FROM public.digital_products WHERE id = _product_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_p.store_id <> v_store THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_p.status = 'archived' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.digital_products
     SET moderation_status = 'pending', status = 'draft', moderation_note = NULL
   WHERE id = v_p.id;

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_product', 'digital_product', v_p.id,
          'Moderasi produk: ' || v_p.name,
          'Tinjau produk seller sebelum dipublikasikan.', 'normal')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

  PERFORM public.write_audit_log('product.submit_review', 'digital_product', v_p.id, NULL, NULL,
    'Produk diajukan untuk moderasi', NULL, NULL);

  RETURN jsonb_build_object('moderation_status', 'pending');
END; $$;

-- 7) RPC: admin moderasi produk ---------------------------------------------
CREATE OR REPLACE FUNCTION public.review_product(_product_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.digital_products; v_new text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  -- Gunakan permission produk yang sudah ada.
  IF NOT public.has_permission(auth.uid(), 'products.update') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_p FROM public.digital_products WHERE id = _product_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_p.moderation_status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  v_new := CASE _decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;

  UPDATE public.digital_products
     SET moderation_status = v_new,
         moderation_note = _reason,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         status = CASE WHEN _decision = 'approve' THEN 'published' ELSE 'draft' END
   WHERE id = v_p.id;

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
   WHERE source_type = 'digital_product' AND source_id = v_p.id AND status <> 'completed';

  PERFORM public.write_audit_log('product.moderate_' || _decision, 'digital_product', v_p.id,
    to_jsonb(v_p), jsonb_build_object('moderation_status', v_new, 'status',
      CASE WHEN _decision='approve' THEN 'published' ELSE 'draft' END), _reason, NULL, NULL);

  RETURN jsonb_build_object('moderation_status', v_new);
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_product_for_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_for_review(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_product(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_product(uuid, text, text) TO authenticated;

-- 8) RLS pada stores: izinkan SELECT publik untuk storefront (store aktif) ---
DROP POLICY IF EXISTS stores_select_public ON public.stores;
CREATE POLICY stores_select_public ON public.stores
  FOR SELECT TO anon, authenticated
  USING (status = 'active');
