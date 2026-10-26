-- ============================================================================
-- PERBAIKAN dari perbaikan: pengajuan ulang ditolak oleh trigger proteksi
--
-- MASALAH (ditemukan lewat uji):
--   `apply_as_seller` versi baru meng-update stores.status='pending' untuk
--   pengajuan ulang. Tetapi trigger `protect_store_privileged_fields`
--   mengembalikan `NEW.status := OLD.status` untuk semua non-admin, sehingga
--   status tetap 'rejected' walau nama/slug berhasil berubah.
--
--   Bukti uji: respons `{"reapplied":true}` tetapi stores.status tetap 'rejected'.
--
-- PERBAIKAN:
--   Trigger tidak boleh menebak dari siapa pemanggilnya. Beri jalur eksplisit:
--   `apply_as_seller` menandai transaksi dengan GUC lokal, dan trigger
--   mengizinkan transisi HANYA `rejected -> pending` bila penanda itu ada.
--   Seller tidak bisa memalsukan GUC ini lewat PostgREST karena nilainya di-set
--   di dalam fungsi SECURITY DEFINER, bukan dari request.
--
-- Sifat: ADITIF (CREATE OR REPLACE FUNCTION).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_store_privileged_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reapply boolean := COALESCE(current_setting('app.seller_reapply', true), '') = 'on';
BEGIN
  -- Admin platform dan service_role bebas; mereka jalur resmi perubahan status.
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Jalur pengajuan ulang yang sah: HANYA rejected -> pending.
  IF v_reapply AND OLD.status = 'rejected' AND NEW.status = 'pending' THEN
    NEW.is_platform := OLD.is_platform;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.suspended_reason := OLD.suspended_reason;
    NEW.owner_id := OLD.owner_id;
    NEW.slug := OLD.slug;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  -- Non-admin (seller) tidak boleh menyentuh kolom kewenangan platform.
  NEW.status := OLD.status;
  NEW.is_platform := OLD.is_platform;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.suspended_reason := OLD.suspended_reason;
  NEW.owner_id := OLD.owner_id;
  NEW.slug := OLD.slug;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stores_protect_privileged ON public.stores;
CREATE TRIGGER stores_protect_privileged
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.protect_store_privileged_fields();

-- Set penanda di dalam apply_as_seller, lalu bersihkan di akhir.
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

  PERFORM pg_advisory_xact_lock(710004, hashtext(v_user::text));

  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR UPDATE;

  IF v_store.id IS NOT NULL THEN
    IF v_store.status = 'rejected' THEN
      IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug AND id <> v_store.id) THEN
        RAISE EXCEPTION 'SLUG_TAKEN';
      END IF;

      -- Penanda untuk trigger: transisi rejected -> pending ini sah.
      PERFORM set_config('app.seller_reapply', 'on', true);

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

      PERFORM set_config('app.seller_reapply', 'off', true);

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
    SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user;
    IF v_store.id IS NOT NULL THEN
      RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', true);
    END IF;
    RAISE EXCEPTION 'SLUG_TAKEN';
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) TO authenticated;
