-- ============================================================================
-- MARKETPLACE — Ulasan per Seller (data untuk menu Performa/Reputasi)
--
-- Tujuan: ulasan produk terhubung ke TOKO, sehingga seller dapat melihat
--         rating & ulasan untuk tokonya sendiri (data nyata, bukan palsu).
--
-- Sifat: ADITIF. store_id nullable → backfill dari produk → index.
-- Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop policy/fungsi/kolom.
-- ============================================================================

ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_reviews_store ON public.product_reviews (store_id, is_visible);

-- Backfill: ambil store dari produk.
UPDATE public.product_reviews pr
   SET store_id = dp.store_id
  FROM public.digital_products dp
 WHERE pr.product_id = dp.id
   AND pr.store_id IS NULL;

-- RLS: seller melihat ulasan tokonya sendiri.
DROP POLICY IF EXISTS reviews_select_seller_own ON public.product_reviews;
CREATE POLICY reviews_select_seller_own ON public.product_reviews
  FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND store_id = public.my_store_id());

-- Agregat rating toko (dipakai dashboard seller & storefront).
CREATE OR REPLACE FUNCTION public.store_rating_summary(_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'average', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    'total', COUNT(*)
  )
  FROM public.product_reviews
  WHERE store_id = _store_id AND is_visible = true;
$$;

REVOKE EXECUTE ON FUNCTION public.store_rating_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO authenticated;
