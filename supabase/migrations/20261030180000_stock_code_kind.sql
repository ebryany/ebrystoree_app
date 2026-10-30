-- Jenis isi stok untuk produk mode 'code': kode/link biasa atau akun (email +
-- password + catatan). Akun disimpan di product_stock_codes.code sebagai JSON
-- sehingga alur klaim, antrean, dan pengiriman yang sudah ada dipakai apa adanya.

ALTER TABLE public.digital_products
  ADD COLUMN IF NOT EXISTS code_kind text NOT NULL DEFAULT 'code';

ALTER TABLE public.digital_products DROP CONSTRAINT IF EXISTS digital_products_code_kind_check;
ALTER TABLE public.digital_products ADD CONSTRAINT digital_products_code_kind_check
  CHECK (code_kind IN ('code', 'account'));
