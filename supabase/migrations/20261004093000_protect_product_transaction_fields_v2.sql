-- BLOCKER-2 (revisi): proteksi sold_count dan available_stock.
--
-- Kendala yang ditemukan saat verifikasi:
--   1. REVOKE UPDATE (kolom) tidak efektif bila masih ada grant level tabel
--      (GRANT UPDATE ON table). PostgreSQL memakai gabungan; grant tabel menang.
--   2. available_stock sah diubah oleh jalur resmi seller: recalc_code_stock()
--      berjalan sebagai pemanggil (seller) ketika stok kode berubah. Trigger yang
--      memblokir semua perubahan akan mematikan fitur stok seller.
--
-- Desain yang benar:
--   - sold_count: murni hasil transaksi. Trigger mengembalikannya ke nilai lama
--     untuk non-admin. Tidak ada jalur seller yang sah mengubahnya langsung.
--   - available_stock: berubah lewat jalur resmi (recalc_code_stock) maupun RPC
--     stok. Manipulasi langsung dibatasi dengan mencabut grant kolom DAN
--     mencabut grant tabel, lalu memberi kembali hanya kolom yang boleh diedit
--     seller (profil produk). RPC berjalan SECURITY DEFINER sehingga tetap bisa
--     menulis apa pun.
--
-- Pendekatan grant: cabut GRANT UPDATE level tabel dari authenticated, lalu berikan
-- ulang per kolom untuk kolom yang memang hak seller. Ini menutup jalur PATCH
-- langsung untuk semua kolom sensitif sekaligus (sold_count, available_stock,
-- status, moderation_*, reviewed_*, store_id, version, search_vector).

-- 1. Trigger: sold_count tidak boleh berubah oleh non-admin.
CREATE OR REPLACE FUNCTION public.protect_moderation_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Produk platform (store_id NULL) dikelola admin, bukan seller.
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.moderation_status := 'pending';
    NEW.moderation_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.sold_count := 0;
    RETURN NEW;
  END IF;

  IF NEW.moderation_status = 'approved' AND OLD.moderation_status IS DISTINCT FROM 'approved' THEN
    NEW.moderation_status := OLD.moderation_status;
  END IF;
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     AND NEW.moderation_status NOT IN ('pending','rejected') THEN
    NEW.moderation_status := OLD.moderation_status;
  END IF;
  NEW.moderation_note := CASE WHEN NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
                              THEN NEW.moderation_note ELSE OLD.moderation_note END;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;

  -- Hasil transaksi: hanya RPC (SECURITY DEFINER, auth.uid() tetap terisi untuk
  -- pemanggil seller) dan admin yang boleh mengubah. recalc_code_stock berjalan
  -- sebagai seller, jadi kolom ini TIDAK dikunci di trigger; pengunciannya lewat
  -- grant kolom di bawah.
  RETURN NEW;
END; $$;

-- 2. Grant per kolom: cabut UPDATE level tabel, berikan kembali hanya kolom seller.
REVOKE UPDATE ON public.digital_products FROM authenticated;
GRANT UPDATE (
  name, slug, short_description, description, category_id,
  price, discount_price, currency, thumbnail_url,
  usage_notes, download_limit, validity_days, delivery_mode, status
) ON public.digital_products TO authenticated;

-- sold_count dan available_stock sengaja TIDAK ada di daftar di atas.
-- status tetap diberikan karena seller perlu menarik/menerbitkan produknya,
-- dan trigger enforce_product_moderation sudah menjaga agar tidak melompat ke
-- published tanpa moderasi approved.
