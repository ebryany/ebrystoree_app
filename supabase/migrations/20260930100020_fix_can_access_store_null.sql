-- ============================================================================
-- PERBAIKAN dari perbaikan: `can_access_store` mengembalikan NULL
--
-- MASALAH (ditemukan lewat uji, bukan dugaan):
--   Definisi pertama memakai ekspresi boolean SQL:
--     _store_id IS NOT NULL AND auth.uid() IS NOT NULL
--     AND (_store_id = my_store_id() OR has_permission(...))
--
--   Bila pemanggil TIDAK punya toko, `my_store_id()` = NULL sehingga
--   `_store_id = NULL` menghasilkan NULL. NULL OR false = NULL.
--   Akibatnya fungsi mengembalikan NULL, dan di PL/pgSQL `IF NOT NULL`
--   bernilai NULL (dianggap TIDAK terpenuhi) sehingga guard LOLOS.
--   IDOR-nya masih terbuka meski kode terlihat sudah "dijaga".
--
-- PERBAIKAN:
--   1. Bungkus dengan COALESCE(..., false) agar hasilnya selalu boolean tegas.
--   2. Tambahkan bypass eksplisit untuk service_role (job server-side seperti
--      cron/settlement memanggil fungsi ini TANPA auth.uid(); sebelumnya
--      mereka ikut terblokir).
--
-- Sifat: ADITIF (hanya mengganti isi fungsi).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_access_store(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    _store_id IS NOT NULL
    AND (
      -- service_role: jalur server-side tepercaya (cron, settlement, job).
      auth.role() = 'service_role'
      OR (
        auth.uid() IS NOT NULL
        AND (
          _store_id = public.my_store_id()
          OR public.has_permission(auth.uid(), 'sellers.view')
        )
      )
    ),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(uuid) TO authenticated, service_role;
