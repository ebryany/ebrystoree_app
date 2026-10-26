-- ============================================================================
-- BANNER TOKO + UNGGAHAN LOGO/BANNER
--
-- Temuan (riset 2026-10-04): tabel stores hanya punya logo_url. Header halaman
-- toko memakai kotak kosong sebagai pengganti banner, dan pengaturan toko hanya
-- menerima URL logo tempelan (belum ada unggahan berkas).
--
-- Perbaikan (aditif):
--   1. Kolom banner_url pada stores (nullable; kosong = header polos seperti sekarang).
--   2. Kolom banner_position pada stores untuk mengatur titik fokus gambar
--      (0-100, default 50) supaya seller bisa memilih bagian gambar yang terlihat.
--
-- Rollback: ALTER TABLE public.stores DROP COLUMN banner_position, DROP COLUMN banner_url;
-- ============================================================================

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS banner_position integer NOT NULL DEFAULT 50;

-- Fokus banner hanya masuk akal 0-100.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stores_banner_position_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_banner_position_check
      CHECK (banner_position >= 0 AND banner_position <= 100);
  END IF;
END $$;
