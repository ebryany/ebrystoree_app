-- Ulasan tersimpan tanpa tautan toko: kolom product_reviews.store_id ditambahkan
-- di 20260930100017 dengan backfill sekali jalan, tetapi RPC submit_product_review
-- dan insert langsung dari klien tidak pernah mengisinya. Akibatnya rating toko
-- selalu 0 dan seller tidak melihat ulasannya (filter store_id = my_store_id()).
--
-- Perbaikan dua lapis:
--   1. Backfill ulasan lama dari produknya.
--   2. Trigger yang menurunkan store_id dari produk pada SEMUA jalur tulis,
--      supaya tidak ada jalur baru yang bisa melewatkannya lagi.
-- Tidak ada perubahan aturan: hanya pembeli yang boleh mengulas (dijaga RPC dan
-- policy), dan is_visible tetap dihormati di semua agregat.

-- 1. Backfill: hanya baris yang belum tertaut, jangan menimpa tautan yang ada.
UPDATE public.product_reviews pr
   SET store_id = dp.store_id
  FROM public.digital_products dp
 WHERE pr.product_id = dp.id
   AND pr.store_id IS NULL
   AND dp.store_id IS NOT NULL;

-- 2. Trigger penjaga. SECURITY DEFINER supaya pembacaan produk tidak bergantung
--    pada RLS pemanggil; nilainya murni turunan sistem, bukan input klien.
CREATE OR REPLACE FUNCTION public.set_review_store_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store uuid;
BEGIN
  SELECT dp.store_id INTO v_store FROM public.digital_products dp WHERE dp.id = NEW.product_id;
  -- Produk platform boleh tanpa toko; biarkan NULL alih-alih menebak.
  NEW.store_id := v_store;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_reviews_store_id ON public.product_reviews;
CREATE TRIGGER trg_product_reviews_store_id
BEFORE INSERT OR UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_review_store_id();
