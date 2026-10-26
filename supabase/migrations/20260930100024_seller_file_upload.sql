-- ============================================================================
-- MARKETPLACE — PROMPT 14: Upload File Produk Seller
--
-- Tujuan: seller bisa upload/kelola file produk mereka sendiri melalui
--         server functions (signed URL). Perubahan file me-reset moderasi.
--
-- Keputusan Owner:
--   - Upload/ganti file RESET moderation_status ke 'pending' + status ke 'draft'
--   - Seller boleh input stock codes sendiri (mode 'code')
--
-- Sifat: ADITIF. Trigger baru, RPC baru. Tidak mengubah migrasi lama.
-- Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop trigger + functions di bawah ini.
-- ============================================================================

-- 1) Helper: verifikasi seller memiliki produk tertentu -----------------------
--    Mengembalikan store_id jika produk milik seller, NULL jika bukan.
CREATE OR REPLACE FUNCTION public.verify_seller_product_ownership(
  _product_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_store_id uuid;
  v_my_store uuid;
BEGIN
  SELECT my_store_id() INTO v_my_store;
  IF v_my_store IS NULL THEN RETURN NULL; END IF;

  SELECT store_id INTO v_store_id
    FROM public.digital_products
   WHERE id = _product_id AND store_id = v_my_store AND deleted_at IS NULL;

  RETURN v_store_id;
END;
$$;

-- 2) Trigger: reset moderasi saat file produk non-platform berubah -----------
--    Hanya berlaku untuk produk seller (store bukan platform).
CREATE OR REPLACE FUNCTION public.trg_file_change_reset_moderation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_platform boolean;
BEGIN
  -- Tentukan product_id dari row yang berubah
  -- INSERT/UPDATE → NEW, DELETE → OLD
  DECLARE v_pid uuid := COALESCE(NEW.product_id, OLD.product_id);
  BEGIN
    SELECT s.is_platform INTO v_is_platform
      FROM public.digital_products dp
      JOIN public.stores s ON s.id = dp.store_id
     WHERE dp.id = v_pid;

    IF NOT COALESCE(v_is_platform, true) THEN
      UPDATE public.digital_products
         SET moderation_status = 'pending',
             status = 'draft',
             reviewed_by = NULL,
             reviewed_at = NULL,
             moderation_note = NULL
       WHERE id = v_pid
         AND moderation_status != 'pending';
    END IF;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_product_files_reset_moderation
  AFTER INSERT OR DELETE ON public.digital_product_files
  FOR EACH ROW EXECUTE FUNCTION public.trg_file_change_reset_moderation();

-- Juga reset saat stock codes berubah (mode 'code')
CREATE TRIGGER trg_stock_codes_reset_moderation
  AFTER INSERT OR DELETE ON public.product_stock_codes
  FOR EACH ROW EXECUTE FUNCTION public.trg_file_change_reset_moderation();

-- 3) RPC: seller ingest stock codes (batch) ----------------------------------
--    Seller paste kode-kode sebagai array text. Validasi ownership + mode.
CREATE OR REPLACE FUNCTION public.seller_ingest_stock_codes(
  _product_id uuid,
  _codes text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_store_id uuid;
  v_mode text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_code text;
BEGIN
  -- Ownership check
  SELECT verify_seller_product_ownership(_product_id) INTO v_store_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Mode check
  SELECT delivery_mode INTO v_mode FROM public.digital_products WHERE id = _product_id;
  IF v_mode != 'code' THEN
    RAISE EXCEPTION 'MODE_NOT_CODE';
  END IF;

  -- Limit: max 500 kode per batch
  IF array_length(_codes, 1) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_CODES';
  END IF;

  -- Insert, skip duplicates
  FOREACH v_code IN ARRAY _codes LOOP
    v_code := btrim(v_code);
    IF length(v_code) < 1 THEN CONTINUE; END IF;

    BEGIN
      INSERT INTO public.product_stock_codes (product_id, code, source, status)
      VALUES (_product_id, v_code, 'seller', 'available');
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$$;

-- 4) Unique constraint pada stock codes (produk+kode) agar tidak duplikat -----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE indexname = 'idx_stock_codes_product_code_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_stock_codes_product_code_unique
      ON public.product_stock_codes (product_id, code)
     WHERE status != 'void';
  END IF;
END $$;

-- 5) RLS: seller bisa SELECT stock codes produknya sendiri --------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE policyname = 'stock_codes_seller_read' AND tablename = 'product_stock_codes'
  ) THEN
    CREATE POLICY stock_codes_seller_read ON public.product_stock_codes
      FOR SELECT TO authenticated
      USING (
        product_id IN (
          SELECT id FROM public.digital_products
           WHERE store_id = public.my_store_id()
        )
      );
  END IF;
END $$;

-- 6) GRANT execute pada RPC baru ----------------------------------------------
GRANT EXECUTE ON FUNCTION public.verify_seller_product_ownership(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seller_ingest_stock_codes(uuid, text[]) TO authenticated;
