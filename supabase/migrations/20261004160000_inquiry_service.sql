-- ============================================================================
-- INQUIRY UNTUK JASA (chat pembeli-penjual dari kartu jasa)
--
-- Temuan (riset 2026-10-04): sistem chat/inquiry hanya mengenal produk
-- (product_inquiries.product_id). Kartu jasa tidak punya tombol chat karena
-- tidak ada jalur untuk memulai percakapan tentang sebuah jasa.
--
-- Perbaikan (aditif): kolom service_id pada product_inquiries, dengan CHECK
-- bahwa setiap baris menunjuk tepat satu target (produk atau jasa).
--
-- Rollback: ALTER TABLE public.product_inquiries DROP CONSTRAINT product_inquiries_target_check;
--           DROP INDEX idx_product_inquiries_service;
--           ALTER TABLE public.product_inquiries DROP COLUMN service_id;
-- ============================================================================

ALTER TABLE public.product_inquiries ADD COLUMN IF NOT EXISTS service_id uuid
  REFERENCES public.marketplace_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_inquiries_service
  ON public.product_inquiries (service_id);

-- Satu baris inquiry harus menunjuk ke tepat satu target. Baris lama (produk
-- saja, atau tanpa target) tetap sah: produk boleh ada tanpa jasa, dan
-- sebaliknya; yang dilarang adalah keduanya terisi sekaligus.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_inquiries_target_check'
  ) THEN
    ALTER TABLE public.product_inquiries
      ADD CONSTRAINT product_inquiries_target_check
      CHECK (NOT (product_id IS NOT NULL AND service_id IS NOT NULL));
  END IF;
END $$;
