-- Agregat rating toko hanya menghitung ulasan dari transaksi terverifikasi
-- (is_verified = true) yang sudah tampil (is_visible = true), sehingga ulasan
-- tamu atau belum terverifikasi tidak memengaruhi skor rating toko.

CREATE OR REPLACE FUNCTION public.store_rating_summary(_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'average', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    'total', COUNT(*)
  )
  FROM public.product_reviews
  WHERE store_id = _store_id
    AND is_visible = true
    AND is_verified = true;
$$;

REVOKE ALL ON FUNCTION public.store_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO anon, authenticated;
