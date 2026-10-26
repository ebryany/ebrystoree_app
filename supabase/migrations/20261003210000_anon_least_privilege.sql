-- Least privilege untuk anon.
--
-- Supabase memberi GRANT ALL ke anon/authenticated saat tabel dibuat. Untuk anon
-- itu berarti 45 tabel punya hak tulis (INSERT/UPDATE/DELETE/TRUNCATE), termasuk
-- tabel uang. RLS memang memblokir hari ini, tetapi satu policy yang salah tambah
-- langsung menjadi lubang kritis. Grant berlebih dicabut di sini.
--
-- Daftar putih SELECT anon adalah tabel yang benar-benar dibaca halaman publik
-- lewat createPublicClient: katalog, layanan, toko, artikel, ulasan, dan settings
-- publik. Semua akses lain ditolak di level grant, bukan hanya RLS.

DO $$
DECLARE
  v_table record;
  v_public_read text[] := ARRAY[
    'articles', 'categories', 'digital_products', 'product_reviews', 'profiles',
    'service_addons', 'service_packages', 'services', 'stores', 'system_settings'
  ];
BEGIN
  FOR v_table IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    -- Selalu cabut hak tulis anon di semua tabel.
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon',
      v_table.relname
    );
    -- SELECT hanya untuk tabel publik yang sah.
    IF NOT (v_table.relname = ANY (v_public_read)) THEN
      EXECUTE format('REVOKE SELECT ON public.%I FROM anon', v_table.relname);
    END IF;
  END LOOP;
END;
$$;

-- Fungsi internal tidak boleh dipanggil anon. Yang dipertahankan hanya fungsi
-- yang memang publik: pencarian katalog dan agregat rating toko.
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
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
        v_fn.proname, pg_get_function_identity_arguments(v_fn.oid));
    END IF;
  END LOOP;
END;
$$;

-- Lima fungsi SECURITY DEFINER berjalan tanpa search_path tetap; itu celah
-- search_path hijacking. Semua diarahkan ke public secara eksplisit.
ALTER FUNCTION public.get_my_inventory_summary() SET search_path = public;
ALTER FUNCTION public.get_my_low_stock_products(integer) SET search_path = public;
ALTER FUNCTION public.search_products_fts(text, text, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.seller_ingest_stock_codes(uuid, text[]) SET search_path = public;
ALTER FUNCTION public.verify_seller_product_ownership(uuid) SET search_path = public;
