-- ============================================================================
-- PERBAIKAN PROMPT 06: pemberian role seller dipindah ke saat approval admin.
--
-- Alasan: trigger `protect_role_changes` melarang user memberi peran untuk akun
-- sendiri (proteksi privilege escalation). Karena `apply_as_seller` berjalan
-- sebagai SECURITY DEFINER dengan auth.uid() = pendaftar, pemberian role di
-- dalamnya diblokir. Solusi: role diberikan saat admin menyetujui.
--
-- Migrasi ini menulis ulang kedua fungsi (CREATE OR REPLACE, aditif).
-- Rollback: kembalikan definisi dari 20260930100011.
-- ============================================================================

-- 1) DAFTAR SEBAGAI SELLER (tanpa pemberian role) ----------------------------
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

  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user;
  IF v_store.id IS NOT NULL THEN
    RETURN jsonb_build_object('store_id', v_store.id, 'status', v_store.status, 'duplicate', true);
  END IF;

  IF EXISTS (SELECT 1 FROM public.stores WHERE slug = v_slug) THEN RAISE EXCEPTION 'SLUG_TAKEN'; END IF;

  INSERT INTO public.stores (owner_id, name, slug, description, contact_phone, contact_email, status)
  VALUES (v_user, btrim(_name), v_slug, NULLIF(btrim(COALESCE(_description,'')),''),
          NULLIF(btrim(COALESCE(_contact_phone,'')),''), NULLIF(btrim(COALESCE(_contact_email,'')),''), 'pending')
  RETURNING * INTO v_store;

  -- Role 'seller' TIDAK diberikan di sini (lihat catatan di atas).

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
END; $$;

-- 2) ADMIN REVIEW (memberi role seller saat approve) -------------------------
CREATE OR REPLACE FUNCTION public.review_seller(_store_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store public.stores; v_new text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'sellers.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF v_store.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_store.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  v_new := CASE _decision WHEN 'approve' THEN 'active' ELSE 'rejected' END;

  UPDATE public.stores
     SET status = v_new, reviewed_by = auth.uid(), reviewed_at = now(), verification_note = _reason
   WHERE id = v_store.id;

  -- Beri role seller HANYA saat disetujui (admin berbeda dari pemilik → lolos trigger).
  IF _decision = 'approve' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_store.owner_id, 'seller')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
   WHERE source_type = 'store' AND source_id = v_store.id AND status <> 'completed';

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_store.owner_id, 'seller.' || v_new, 'Status toko diperbarui',
          'Toko "' || v_store.name || '" kini berstatus ' || v_new || '.', 'store', v_store.id);

  PERFORM public.write_audit_log('seller.' || _decision, 'store', v_store.id, to_jsonb(v_store),
    jsonb_build_object('status', v_new), _reason, NULL, NULL);

  RETURN jsonb_build_object('status', v_new);
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_as_seller(text, text, text, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.review_seller(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_seller(uuid, text, text) TO authenticated;
