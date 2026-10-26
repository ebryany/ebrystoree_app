-- Koreksi: REVOKE dari anon saja tidak cukup karena PostgreSQL memberi EXECUTE
-- ke PUBLIC secara default untuk fungsi baru. anon mewarisi lewat PUBLIC, jadi
-- has_function_privilege('anon', ...) tetap true walau grant langsung dicabut.
--
-- Migration ini mencabut EXECUTE dari PUBLIC dan anon untuk semua fungsi internal,
-- lalu memberi kembali hanya fungsi publik yang disetujui (katalog dan rating).
-- Sama seperti pola yang sudah dipakai di migration media (try_uuid).

DO $$
DECLARE
  v_fn record;
  v_public_exec text[] := ARRAY['search_products_fts', 'product_rating_summary', 'store_rating_summary'];
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype <> 'pg_catalog.trigger'::regtype
  LOOP
    IF NOT (v_fn.proname = ANY (v_public_exec)) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        v_fn.proname, pg_get_function_identity_arguments(v_fn.oid));
    END IF;
  END LOOP;
END;
$$;

-- Fungsi publik: tetap boleh dipanggil anon, dan pastikan authenticated juga bisa.
GRANT EXECUTE ON FUNCTION public.search_products_fts(text, text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_rating_summary() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO anon, authenticated;
