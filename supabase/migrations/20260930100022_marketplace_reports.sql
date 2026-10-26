-- ============================================================================
-- MARKETPLACE — PROMPT 37: Laporan Marketplace (dapat direkonsiliasi)
--
-- Prinsip dari prompt: "Define GMV, net revenue, seller gross/net, refunds,
-- payout liability, active sellers, sell-through, conversion ONLY WHERE SOURCE
-- DATA EXISTS" dan "Reconcile reports against ledger/payment/refund sources,
-- not frontend events."
--
-- Karena itu setiap angka di sini dihitung dari tabel transaksi nyata
-- (order_items, seller_ledger, orders), bukan dari event UI.
--
-- Yang SENGAJA tidak ditampilkan:
--   - Platform fee / net revenue platform → menunggu keputusan Owner O-01
--     (fee saat ini 0 di ledger). Menampilkan "pendapatan platform" sekarang
--     akan menyesatkan.
--   - Payout liability → menunggu O-03/O-04 (kebijakan payout/hold).
--
-- Sifat: ADITIF. Rollback: drop kedua fungsi.
-- ============================================================================

-- 1) RINGKASAN PLATFORM --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_marketplace_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT jsonb_build_object(
    -- Seller
    'stores_total', (SELECT COUNT(*) FROM public.stores WHERE NOT is_platform),
    'stores_active', (SELECT COUNT(*) FROM public.stores WHERE NOT is_platform AND status = 'active'),
    'stores_pending', (SELECT COUNT(*) FROM public.stores WHERE NOT is_platform AND status = 'pending'),
    'stores_suspended', (SELECT COUNT(*) FROM public.stores WHERE NOT is_platform AND status = 'suspended'),

    -- Produk
    'products_total', (SELECT COUNT(*) FROM public.digital_products WHERE deleted_at IS NULL),
    'products_published', (SELECT COUNT(*) FROM public.digital_products WHERE deleted_at IS NULL AND status = 'published'),
    'products_pending', (SELECT COUNT(*) FROM public.digital_products WHERE deleted_at IS NULL AND moderation_status = 'pending'),

    -- GMV: nilai baris order milik seller pada order yang sudah dibayar.
    -- Definisi eksplisit: hanya order status paid/completed.
    'gmv', COALESCE((
      SELECT SUM(oi.total)
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.store_id IS NOT NULL
         AND o.status IN ('paid', 'completed')
    ), 0),

    -- Penjualan seller (dari LEDGER, bukan dari orders) untuk rekonsiliasi.
    'seller_sales_ledger', COALESCE((
      SELECT SUM(amount) FROM public.seller_ledger
       WHERE direction = 'credit' AND source_type = 'sale'
    ), 0),
    'seller_refund_ledger', COALESCE((
      SELECT SUM(amount) FROM public.seller_ledger
       WHERE direction = 'debit' AND source_type = 'refund'
    ), 0),
    'seller_balance_total', COALESCE((
      SELECT SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END)
        FROM public.seller_ledger
    ), 0),

    -- Refund dari tabel refunds (bukan ledger), sebagai pembanding.
    'refunds_total', (SELECT COUNT(*) FROM public.refunds),
    'refunds_completed_amount', COALESCE((
      SELECT SUM(amount) FROM public.refunds WHERE status = 'completed'
    ), 0),

    -- Ulasan
    'reviews_total', (SELECT COUNT(*) FROM public.product_reviews WHERE is_visible = true),

    -- Kesegaran data: kapan terakhir ada penjualan tercatat.
    'last_sale_at', (
      SELECT MAX(created_at) FROM public.seller_ledger
       WHERE direction = 'credit' AND source_type = 'sale'
    )
  ) INTO v_result;

  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_marketplace_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketplace_overview() TO authenticated;

-- 2) PERINGKAT SELLER ----------------------------------------------------------
-- Diurutkan dari penjualan nyata di ledger. `_limit` dibatasi agar aman.
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
      SELECT SUM(amount) AS sales FROM public.seller_ledger
       WHERE store_id = s.id AND direction = 'credit' AND source_type = 'sale'
    ) led ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS paid_count
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.store_id = s.id AND o.status IN ('paid', 'completed')
    ) ord ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS published FROM public.digital_products
       WHERE store_id = s.id AND status = 'published' AND deleted_at IS NULL
    ) prod ON true
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(rating)::numeric, 2) AS average FROM public.product_reviews
       WHERE store_id = s.id AND is_visible = true
    ) rat ON true
   WHERE NOT s.is_platform
   ORDER BY COALESCE(led.sales, 0) DESC, s.created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 50));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_seller_leaderboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_seller_leaderboard(integer) TO authenticated;
