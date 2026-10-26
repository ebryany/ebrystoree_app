-- ============================================================================
-- MARKETPLACE — Perbaikan Keamanan: IDOR pada RPC Data Toko
--
-- MASALAH NYATA (dibuktikan lewat uji, bukan dugaan):
--   `get_store_balance(_store_id)` dan `store_rating_summary(_store_id)` adalah
--   SECURITY DEFINER yang menerima store_id ARBITRER tanpa memeriksa pemanggil.
--   Uji dengan user biasa TANPA toko berhasil membaca saldo toko milik orang
--   lain (Rp500.000) — yaitu kebocoran data finansial antar-seller.
--
-- Prinsip yang dilanggar (AGENTS.md / Prompt 29):
--   "RLS + server authorization are mandatory. UI hiding is not access control."
--   "Setiap objek sensitif wajib punya object-level authorization."
--
-- PERBAIKAN:
--   Helper `can_access_store(_store_id)` = pemilik toko ATAU staff dengan
--   permission `sellers.view`. Dipakai ulang oleh RPC admin (Prompt 35),
--   sehingga tidak ada dua definisi otorisasi yang bisa saling menyimpang.
--
-- Sifat: ADITIF (hanya mengganti isi fungsi; tidak mengubah tabel/policy).
-- Rollback: kembalikan definisi lama tanpa guard (TIDAK disarankan).
-- ============================================================================

-- 1) HELPER OTORISASI OBJEK TOKO ---------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_store(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _store_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       _store_id = public.my_store_id()
       OR public.has_permission(auth.uid(), 'sellers.view')
     );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(uuid) TO authenticated;

-- 2) SALDO TOKO: wajib lolos otorisasi objek ---------------------------------
CREATE OR REPLACE FUNCTION public.get_store_balance(_store_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_store(_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN (
    SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::bigint
      FROM public.seller_ledger
     WHERE store_id = _store_id
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_store_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_balance(uuid) TO authenticated;

-- 3) RATING TOKO: wajib lolos otorisasi objek ---------------------------------
-- Catatan: ulasan individual memang publik (RLS product_reviews), tetapi
-- agregat per-toko tidak boleh bisa diintip untuk toko yang belum tayang.
CREATE OR REPLACE FUNCTION public.store_rating_summary(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_store(_store_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'average', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
      'total', COUNT(*)
    )
      FROM public.product_reviews
     WHERE store_id = _store_id AND is_visible = true
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.store_rating_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO authenticated;
