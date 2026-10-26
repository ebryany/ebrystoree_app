-- BLOCKER-2: seller dapat memalsukan jumlah terjual dan ketersediaan stok.
--
-- Temuan: grant kolom authenticated pada digital_products mencakup sold_count dan
-- available_stock. Trigger protect_moderation_fields hanya melindungi
-- moderation_status, moderation_note, reviewed_by, reviewed_at. Akibatnya seller
-- dapat memanggil PostgREST langsung:
--   PATCH /rest/v1/digital_products?id=eq.<id>  { "sold_count": 99999 }
-- dan memalsukan sinyal kepercayaan yang dilihat pembeli.
--
-- sold_count dan available_stock adalah hasil transaksi, bukan data yang boleh
-- diubah manusia. Keduanya hanya berubah lewat RPC transaksi (order, stock).
--
-- Perbaikan dua lapis:
--   1. Perluas protect_moderation_fields agar mengembalikan kedua kolom ke nilai
--      lama untuk non-admin (pola sama seperti BLOCKER-1: koreksi, bukan gagalkan).
--   2. Cabut grant UPDATE kolom sold_count dari authenticated.
--
-- available_stock sengaja TIDAK dicabut di level grant karena seller memerlukan
-- jalur resmi penambahan stok; yang menegakkan larangan manipulasi langsung
-- adalah trigger, sehingga RPC stok tetap bekerja.

CREATE OR REPLACE FUNCTION public.protect_moderation_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Produk platform (store_id NULL) dikelola admin, bukan seller: tidak dibatasi.
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Seller tidak boleh lahir dengan moderation 'approved' (default kolom).
    NEW.moderation_status := 'pending';
    NEW.moderation_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    -- Angka transaksi tidak boleh ditentukan saat pembuatan produk.
    NEW.sold_count := 0;
    RETURN NEW;
  END IF;

  -- Non-admin hanya boleh menurunkan status moderasi (pending/rejected),
  -- tidak pernah menaikkannya ke 'approved'.
  IF NEW.moderation_status = 'approved' AND OLD.moderation_status IS DISTINCT FROM 'approved' THEN
    NEW.moderation_status := OLD.moderation_status;
  END IF;
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     AND NEW.moderation_status NOT IN ('pending','rejected') THEN
    NEW.moderation_status := OLD.moderation_status;
  END IF;
  -- Catatan reviewer hanya boleh berubah bila status moderasinya ikut berubah.
  NEW.moderation_note := CASE WHEN NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
                              THEN NEW.moderation_note ELSE OLD.moderation_note END;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;

  -- Angka transaksi dikembalikan ke nilai lama; perubahan hanya lewat RPC.
  NEW.sold_count := OLD.sold_count;
  NEW.available_stock := OLD.available_stock;

  RETURN NEW;
END; $$;

REVOKE UPDATE (sold_count) ON public.digital_products FROM authenticated;
