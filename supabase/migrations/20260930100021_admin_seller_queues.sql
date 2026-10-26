-- ============================================================================
-- MARKETPLACE — PROMPT 35: Antrean & Daftar Seller untuk Admin
--
-- Tujuan: admin bisa mengoperasikan seller (lihat antrean pengajuan, daftar
--         lengkap, dan drill-down per seller) tanpa membuka tabel `orders`
--         mentah dan tanpa membocorkan PII pembeli.
--
-- Kenapa RPC, bukan query tabel langsung dari server function:
--   1. `orders` tidak boleh dibuka ke seller/staff lewat RLS (PII pembeli),
--      sehingga agregat per-toko harus dihitung di sisi DB.
--   2. Satu tempat otorisasi (`can_access_store`) dipakai ulang, sehingga
--      tidak ada definisi akses kedua yang bisa menyimpang.
--
-- Semua fungsi: SECURITY DEFINER + guard permission eksplisit.
-- Sifat: ADITIF. Rollback: drop ketiga fungsi.
-- ============================================================================

-- 1) ANTREAN & DAFTAR SELLER ---------------------------------------------------
-- `_status` = 'pending' | 'active' | 'suspended' | 'rejected' | 'all'
CREATE OR REPLACE FUNCTION public.admin_list_stores(
  _status text DEFAULT 'all',
  _search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  description text,
  logo_url text,
  status text,
  is_platform boolean,
  contact_phone text,
  contact_email text,
  verification_note text,
  suspended_reason text,
  reviewed_at timestamptz,
  created_at timestamptz,
  owner_id uuid,
  owner_name text,
  product_total bigint,
  product_published bigint,
  product_pending bigint,
  balance bigint,
  rating_average numeric,
  rating_total bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  SELECT s.id,
         s.name,
         s.slug,
         s.description,
         s.logo_url,
         s.status,
         s.is_platform,
         s.contact_phone,
         s.contact_email,
         s.verification_note,
         s.suspended_reason,
         s.reviewed_at,
         s.created_at,
         s.owner_id,
         p.full_name,
         COALESCE(prod.total, 0),
         COALESCE(prod.published, 0),
         COALESCE(prod.pending, 0),
         COALESCE(bal.amount, 0),
         COALESCE(rat.average, 0),
         COALESCE(rat.total, 0)
    FROM public.stores s
    LEFT JOIN public.profiles p ON p.id = s.owner_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE dp.status = 'published') AS published,
             COUNT(*) FILTER (WHERE dp.moderation_status = 'pending') AS pending
        FROM public.digital_products dp
       WHERE dp.store_id = s.id AND dp.deleted_at IS NULL
    ) prod ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::bigint AS amount
        FROM public.seller_ledger sl
       WHERE sl.store_id = s.id
    ) bal ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(ROUND(AVG(pr.rating)::numeric, 2), 0) AS average, COUNT(*) AS total
        FROM public.product_reviews pr
       WHERE pr.store_id = s.id AND pr.is_visible = true
    ) rat ON true
   WHERE (_status = 'all' OR s.status = _status)
     AND (
       _search IS NULL OR btrim(_search) = ''
       OR s.name ILIKE '%' || btrim(_search) || '%'
       OR s.slug ILIKE '%' || btrim(_search) || '%'
     )
   ORDER BY
     -- Antrean yang butuh tindakan selalu di atas.
     CASE s.status WHEN 'pending' THEN 0 WHEN 'suspended' THEN 1 ELSE 2 END,
     s.created_at DESC
   LIMIT 200;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_stores(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_stores(text, text) TO authenticated;

-- 2) RINGKASAN SATU SELLER (untuk halaman drill-down) -------------------------
CREATE OR REPLACE FUNCTION public.admin_store_summary(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store public.stores;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = _store_id;
  IF v_store.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT jsonb_build_object(
    'store', jsonb_build_object(
      'id', v_store.id,
      'name', v_store.name,
      'slug', v_store.slug,
      'description', v_store.description,
      'logo_url', v_store.logo_url,
      'status', v_store.status,
      'is_platform', v_store.is_platform,
      'contact_phone', v_store.contact_phone,
      'contact_email', v_store.contact_email,
      'verification_note', v_store.verification_note,
      'suspended_reason', v_store.suspended_reason,
      'reviewed_by', v_store.reviewed_by,
      'reviewed_at', v_store.reviewed_at,
      'created_at', v_store.created_at,
      'owner_id', v_store.owner_id
    ),
    'owner', (
      SELECT jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone)
        FROM public.profiles p WHERE p.id = v_store.owner_id
    ),
    'balance', COALESCE((
      SELECT SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END)
        FROM public.seller_ledger WHERE store_id = _store_id
    ), 0),
    'rating', (
      SELECT jsonb_build_object(
        'average', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
        'total', COUNT(*)
      ) FROM public.product_reviews
       WHERE store_id = _store_id AND is_visible = true
    ),
    'products', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'published', COUNT(*) FILTER (WHERE status = 'published'),
        'pending', COUNT(*) FILTER (WHERE moderation_status = 'pending'),
        'rejected', COUNT(*) FILTER (WHERE moderation_status = 'rejected'),
        'sold', COALESCE(SUM(sold_count), 0)
      ) FROM public.digital_products
       WHERE store_id = _store_id AND deleted_at IS NULL
    ),
    'orders', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'paid', COUNT(*) FILTER (WHERE o.status IN ('paid','completed')),
        'gross', COALESCE(SUM(oi.total), 0)
      )
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE oi.store_id = _store_id
    )
  ) INTO v_result;

  RETURN v_result;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_store_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_summary(uuid) TO authenticated;

-- 3) TRANSAKSI SELLER (read-only, kolom aman) ---------------------------------
CREATE OR REPLACE FUNCTION public.admin_store_orders(_store_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE (
  item_id uuid,
  order_id uuid,
  order_number text,
  order_status text,
  item_name text,
  unit_price bigint,
  quantity integer,
  total bigint,
  created_at timestamptz,
  paid_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  SELECT oi.id, o.id, o.order_number, o.status, oi.name_snapshot,
         oi.unit_price, oi.quantity, oi.total, oi.created_at, o.paid_at
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.store_id = _store_id
   ORDER BY oi.created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_store_orders(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_orders(uuid, integer) TO authenticated;

-- 4) RIWAYAT LEDGER SELLER (read-only) ----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_store_ledger(_store_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  direction text,
  amount bigint,
  gross_amount bigint,
  platform_fee bigint,
  source_type text,
  reference text,
  note text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.view') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  SELECT sl.id, sl.direction, sl.amount, sl.gross_amount, sl.platform_fee,
         sl.source_type, sl.reference, sl.note, sl.created_at
    FROM public.seller_ledger sl
   WHERE sl.store_id = _store_id
   ORDER BY sl.created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_store_ledger(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_store_ledger(uuid, integer) TO authenticated;
