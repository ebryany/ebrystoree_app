-- ============================================================================
-- PERBAIKAN AUDIT — Seller & Product Lifecycle (bagian 1 dari 3)
--
-- Menutup temuan terverifikasi:
--   SELLER-BL-001  suspend toko tidak mencabut role seller
--   SELLER-BL-002  status rejected adalah dead-end permanen
--   SELLER-BL-003  race apply_as_seller menghasilkan error PostgreSQL mentah
--   SELLER-BL-006  tidak ada sinkronisasi status toko -> role
--   PRODUCT-BL-002 produk toko suspended tetap tampil publik
--   PRODUCT-BL-004 submit_product_for_review tidak cek status toko
--
-- Prinsip: migrasi ADITIF. Tidak mengubah skema, tidak menghapus data.
-- Semua perubahan berupa CREATE OR REPLACE FUNCTION + trigger baru.
-- ============================================================================

-- 1) SINKRONISASI STATUS TOKO -> ROLE SELLER --------------------------------
-- Satu sumber kebenaran: selama toko tidak 'active', role seller dicabut.
-- Saat toko kembali 'active', role diberikan lagi (idempoten).
CREATE OR REPLACE FUNCTION public.sync_seller_role_from_store()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Hanya bereaksi pada perubahan status.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS NULL THEN
    RETURN NEW;  -- toko platform tidak punya seller
  END IF;

  IF NEW.status = 'active' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.owner_id, 'seller')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- pending / suspended / rejected: cabut role seller.
    -- Role lain (customer/admin/operator) tidak disentuh.
    DELETE FROM public.user_roles
     WHERE user_id = NEW.owner_id AND role = 'seller';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stores_sync_seller_role ON public.stores;
CREATE TRIGGER stores_sync_seller_role
AFTER INSERT OR UPDATE OF status ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.sync_seller_role_from_store();

-- 2) SUSPEND TOKO: IKUT MENARIK PRODUK DARI KATALOG -------------------------
-- Status produk disimpan agar bisa dipulihkan: produk yang published
-- dipindah ke draft, dan daftarnya dicatat di kolom penanda (tanpa tabel baru,
-- memakai moderation_note? Tidak — itu milik moderasi).
--
-- Pendekatan dipilih: JANGAN ubah produk. Cukup filter di katalog publik.
-- Alasannya: mengubah status produk merusak riwayat moderasi dan menyulitkan
-- pemulihan. Filter katalog adalah perubahan terkecil dan reversibel.
-- (Lihat migrasi 2 untuk policy/query katalog.)

-- 3) APPLY_AS_SELLER: TANGANI RACE + IZINKAN AJUKAN ULANG ------------------
CREATE OR REPLACE FUNCTION public.apply_as_seller(
  _name text,
  _slug text,
  _description text DEFAULT NULL,
  _contact_phone text DEFAULT NULL,
  _contact_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store public.stores;
  v_slug text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _name IS NULL OR length(btrim(_name)) < 3 THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;

  v_slug := COALESCE(NULLIF(btrim(_slug), ''), lower(regexp_replace(btrim(_name), '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := trim(both '-' from v_slug);
  IF length(v_slug) < 3 THEN RAISE EXCEPTION 'SLUG_INVALID'; END IF;

  -- Serialisasi per-user: mencegah dua request paralel lolos cek duplikat.
  PERFORM pg_advisory_xact_lock(710004, hashtext(v_user::text));

  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR UPDATE;

  IF v_store.id IS NOT NULL THEN
    -- Sudah ada toko.
    IF v_store.status = 'rejected' THEN
      -- SELLER-BL-002: izinkan ajukan ulang. Data diperbarui, status kembali pending.
      IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug AND id <> v_store.id) THEN
        RAISE EXCEPTION 'SLUG_TAKEN';
      END IF;

      UPDATE public.stores
         SET name = btrim(_name),
             slug = v_slug,
             description = NULLIF(btrim(COALESCE(_description,'')),''),
             contact_phone = NULLIF(btrim(COALESCE(_contact_phone,'')),''),
             contact_email = NULLIF(btrim(COALESCE(_contact_email,'')),''),
             status = 'pending',
             verification_note = NULL,
             reviewed_by = NULL,
             reviewed_at = NULL
       WHERE id = v_store.id
       RETURNING * INTO v_store;

      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('review_seller', 'store', v_store.id,
              'Verifikasi seller (pengajuan ulang): ' || v_store.name,
              'Seller mengajukan ulang setelah ditolak.', 'normal')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_user, 'seller.applied', 'Pengajuan ulang diterima',
              'Toko "' || v_store.name || '" diajukan ulang dan menunggu tinjauan.', 'store', v_store.id);

      PERFORM public.write_audit_log('seller.reapply', 'store', v_store.id, to_jsonb(v_store),
        jsonb_build_object('status','pending'), 'Pengajuan ulang setelah penolakan', NULL, NULL);

      RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', false, 'reapplied', true);
    END IF;

    -- Status lain: idempoten, kembalikan yang ada.
    RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug) THEN RAISE EXCEPTION 'SLUG_TAKEN'; END IF;

  INSERT INTO public.stores (owner_id, name, slug, description, contact_phone, contact_email, status)
  VALUES (v_user, btrim(_name), v_slug, NULLIF(btrim(COALESCE(_description,'')),''),
          NULLIF(btrim(COALESCE(_contact_phone,'')),''), NULLIF(btrim(COALESCE(_contact_email,'')),''), 'pending')
  RETURNING * INTO v_store;

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_seller', 'store', v_store.id,
          'Verifikasi seller: ' || v_store.name,
          'Tinjau pengajuan toko seller baru.', 'normal')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'seller.applied', 'Pengajuan toko diterima',
          'Toko "' || v_store.name || '" sedang ditinjau tim kami.', 'store', v_store.id);

  PERFORM public.write_audit_log('seller.apply', 'store', v_store.id, NULL,
    jsonb_build_object('name', v_store.name, 'slug', v_store.slug), 'Pengajuan seller baru', NULL, NULL);

  RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', false);
EXCEPTION
  WHEN unique_violation THEN
    -- SELLER-BL-003: race tetap menghasilkan respons domain, bukan error mentah.
    SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user;
    IF v_store.id IS NOT NULL THEN
      RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', true);
    END IF;
    RAISE EXCEPTION 'SLUG_TAKEN';
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) TO authenticated;

-- 4) SUBMIT PRODUCT: CEK STATUS TOKO ---------------------------------------
CREATE OR REPLACE FUNCTION public.submit_product_for_review(_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p public.digital_products; v_store uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;

  -- PRODUCT-BL-004: hanya toko aktif yang boleh mengisi antrean moderasi.
  SELECT status INTO v_status FROM public.stores WHERE id = v_store;
  IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'STORE_NOT_ACTIVE'; END IF;

  SELECT * INTO v_p FROM public.digital_products WHERE id = _product_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_p.store_id <> v_store THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_p.status = 'archived' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.digital_products
     SET moderation_status = 'pending', status = 'draft', moderation_note = NULL
   WHERE id = v_p.id;

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_product', 'digital_product', v_p.id,
          'Moderasi produk: ' || v_p.name,
          'Tinjau produk seller sebelum dipublikasikan.', 'normal')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

  RETURN jsonb_build_object('moderation_status','pending','status','draft');
END; $$;

REVOKE EXECUTE ON FUNCTION public.submit_product_for_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_for_review(uuid) TO authenticated;
