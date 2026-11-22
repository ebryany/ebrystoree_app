-- ============================================================================
-- EBRYSTORE — Backfill Notifikasi Admin untuk Antrean Seller yang Sudah Ada
--
-- Tujuan:
--   Mengisi notifikasi `admin_seller.*` secara idempoten (ON CONFLICT DO NOTHING)
--   bagi antrean seller/moderasi yang sudah berstatus menunggu sebelum trigger
--   20261122140000 aktif, agar dashboard admin, panel notifikasi seller, dan
--   badge sidebar menampilkan seluruh item menunggu sejak hari pertama.
-- ============================================================================

DO $$
DECLARE
  rec record;
BEGIN
  -- 1) Toko non-platform yang masih berstatus 'pending' (menunggu verifikasi)
  FOR rec IN
    SELECT id, name, slug, status
      FROM public.stores
     WHERE COALESCE(is_platform, false) = false
       AND status = 'pending'
  LOOP
    PERFORM public.notify_seller_admins(
      'admin_seller.registered',
      'Pendaftaran seller baru',
      'Toko "' || rec.name || '" mendaftar sebagai seller dan menunggu verifikasi admin.',
      rec.id,
      'admin_seller:registered:' || rec.id::text,
      'store:' || rec.id::text,
      '/admin/seller/' || rec.id::text,
      jsonb_build_object(
        'store_id', rec.id,
        'store_name', rec.name,
        'store_slug', rec.slug,
        'status', rec.status
      ),
      NULL
    );
  END LOOP;

  -- 2) Produk seller yang masih menunggu moderasi ('pending')
  FOR rec IN
    SELECT dp.id AS product_id, dp.name AS product_name,
           s.id AS store_id, s.name AS store_name, s.slug AS store_slug
      FROM public.digital_products dp
      JOIN public.stores s ON s.id = dp.store_id
     WHERE COALESCE(s.is_platform, false) = false
       AND dp.deleted_at IS NULL
       AND dp.moderation_status = 'pending'
  LOOP
    PERFORM public.notify_seller_admins(
      'admin_seller.product_submitted',
      'Produk seller perlu moderasi',
      'Toko "' || rec.store_name || '" mengajukan produk "' || rec.product_name || '" untuk ditinjau.',
      rec.store_id,
      'admin_seller:product_submitted:backfill:' || rec.product_id::text,
      'digital_product:' || rec.product_id::text,
      '/admin/seller/' || rec.store_id::text,
      jsonb_build_object(
        'store_id', rec.store_id,
        'store_name', rec.store_name,
        'store_slug', rec.store_slug,
        'product_id', rec.product_id,
        'entity_name', rec.product_name,
        'moderation_url', '/admin/seller/produk'
      ),
      NULL
    );
  END LOOP;

  -- 3) Jasa seller yang masih menunggu moderasi ('in_review')
  FOR rec IN
    SELECT ms.id AS service_id, ms.name AS service_name,
           s.id AS store_id, s.name AS store_name, s.slug AS store_slug
      FROM public.marketplace_services ms
      JOIN public.stores s ON s.id = ms.store_id
     WHERE COALESCE(s.is_platform, false) = false
       AND ms.status = 'in_review'
  LOOP
    PERFORM public.notify_seller_admins(
      'admin_seller.service_submitted',
      'Jasa seller perlu moderasi',
      'Toko "' || rec.store_name || '" mengajukan jasa "' || rec.service_name || '" untuk ditinjau.',
      rec.store_id,
      'admin_seller:service_submitted:backfill:' || rec.service_id::text,
      'marketplace_service:' || rec.service_id::text,
      '/admin/seller/' || rec.store_id::text,
      jsonb_build_object(
        'store_id', rec.store_id,
        'store_name', rec.store_name,
        'store_slug', rec.store_slug,
        'service_id', rec.service_id,
        'entity_name', rec.service_name,
        'moderation_url', '/admin/seller/jasa'
      ),
      NULL
    );
  END LOOP;
END;
$$;
