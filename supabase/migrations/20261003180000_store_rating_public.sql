-- Keputusan owner: agregat rating toko boleh tampil publik di halaman toko.
-- Ulasan individu tetap mengikuti policy existing (hanya is_visible = true).
-- Agregat hanya mengembalikan angka rata-rata dan jumlah ulasan; tidak ada
-- identitas penulis, isi ulasan, atau data pribadi.
--
-- Sebelumnya fungsi ini hanya diberikan ke authenticated dan anon tidak boleh
-- memanggilnya. Sekarang anon boleh memanggil, tetapi hanya lewat fungsi ini,
-- bukan akses tabel langsung.

CREATE OR REPLACE FUNCTION public.store_rating_summary(_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'average', COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    'total', COUNT(*)
  )
  FROM public.product_reviews
  WHERE store_id = _store_id AND is_visible = true;
$$;

REVOKE ALL ON FUNCTION public.store_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO anon, authenticated;
