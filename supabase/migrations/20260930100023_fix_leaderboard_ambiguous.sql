-- ============================================================================
-- PERBAIKAN: `admin_seller_leaderboard` gagal karena `store_id` ambigu
--
-- MASALAH (ditemukan lewat uji, bukan dugaan):
--   Pada migrasi 20260930100022, subquery LATERAL pertama memakai `store_id`
--   tanpa kualifikasi tabel. PL/pgSQL tidak bisa membedakan apakah itu merujuk
--   ke kolom tabel atau ke kolom OUT parameter fungsi (RETURNS TABLE juga
--   mendefinisikan `store_id`). Error: column reference "store_id" is ambiguous.
--
-- PERBAIKAN: kualifikasi seluruh kolom di dalam subquery LATERAL.
--
-- Sifat: ADITIF (CREATE OR REPLACE). Rollback: kembali ke 20260930100022.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_seller_leaderboard(_limit integer DEFAULT 10)
RETURNS TABLE (
  store_id uuid,
  store_name text,
  store_slug text,
  store_status text,
  sales_amount bigint,
  orders_paid bigint,
  products_published bigint,
  rating_average numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  SELECT s.id,
         s.name,
         s.slug,
         s.status,
         COALESCE(led.sales, 0)::bigint,
         COALESCE(ord.paid_count, 0)::bigint,
         COALESCE(prod.published, 0)::bigint,
         COALESCE(rat.average, 0)
    FROM public.stores s
    LEFT JOIN LATERAL (
      SELECT SUM(sl.amount) AS sales FROM public.seller_ledger sl
       WHERE sl.store_id = s.id AND sl.direction = 'credit' AND sl.source_type = 'sale'
    ) led ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS paid_count
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.store_id = s.id AND o.status IN ('paid', 'completed')
    ) ord ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS published FROM public.digital_products dp
       WHERE dp.store_id = s.id AND dp.status = 'published' AND dp.deleted_at IS NULL
    ) prod ON true
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(pr.rating)::numeric, 2) AS average FROM public.product_reviews pr
       WHERE pr.store_id = s.id AND pr.is_visible = true
    ) rat ON true
   WHERE NOT s.is_platform
   ORDER BY COALESCE(led.sales, 0) DESC, s.created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 50));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_seller_leaderboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_seller_leaderboard(integer) TO authenticated;
