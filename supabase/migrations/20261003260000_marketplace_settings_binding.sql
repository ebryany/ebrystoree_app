-- Menghubungkan batas media jasa ke pengaturan Marketplace.
--
-- Kendala teknis yang harus dipahami: CHECK constraint hanya menerima fungsi
-- IMMUTABLE, sehingga constraint TIDAK BOLEH membaca system_settings (nilainya
-- berubah kapan saja). Karena itu dipakai dua lapis:
--
--   1. Constraint `is_valid_service_media` = batas aman maksimum (hard cap).
--      Nilainya adalah batas atas rentang yang boleh dipilih admin, bukan nilai
--      yang dikonfigurasi.
--   2. RPC `save_marketplace_service_draft` = menegakkan nilai yang benar-benar
--      dikonfigurasi admin, dibaca dari system_settings dengan fallback default.
--
-- Konsekuensi jujur: menurunkan batas di pengaturan tidak menghapus media yang
-- sudah tersimpan pada jasa lama (data lama tetap valid), tetapi setiap
-- penyimpanan berikutnya untuk jasa itu harus mematuhi batas baru.

-- 1. Hard cap dinaikkan ke batas atas rentang pengaturan.
CREATE OR REPLACE FUNCTION public.is_valid_service_media(_media jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _media IS NULL OR jsonb_typeof(_media) <> 'array' THEN false
    -- Hard cap: batas atas rentang pengaturan (marketplace_media_max <= 10).
    WHEN jsonb_array_length(_media) > 10 THEN false
    WHEN jsonb_array_length(_media) = 0 THEN true
    ELSE (
      SELECT bool_and(
        jsonb_typeof(entry) = 'object'
        AND entry - ARRAY['kind','path','alt','mime','size'] = '{}'::jsonb
        AND entry->>'kind' IN ('image','video')
        AND entry->>'path' IS NOT NULL
        AND length(entry->>'path') BETWEEN 5 AND 400
        AND entry->>'path' LIKE 'service-media/%'
        AND position('..' IN entry->>'path') = 0
        AND entry->>'alt' IS NOT NULL
        AND length(btrim(entry->>'alt')) BETWEEN 1 AND 160
        AND entry->>'mime' IN (
          'image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm'
        )
        AND jsonb_typeof(entry->'size') = 'number'
        AND (entry->>'size')::numeric >= 1
        AND (
          -- Batas atas rentang pengaturan: gambar <= 20 MB, video <= 100 MB.
          (entry->>'kind' = 'image' AND (entry->>'mime') LIKE 'image/%' AND (entry->>'size')::numeric <= 20971520)
          OR (entry->>'kind' = 'video' AND (entry->>'mime') LIKE 'video/%' AND (entry->>'size')::numeric <= 104857600)
        )
      )
      FROM jsonb_array_elements(_media) AS entry
    )
  END;
$$;

-- 2. RPC menegakkan nilai yang dikonfigurasi admin.
CREATE OR REPLACE FUNCTION public.save_marketplace_service_draft(
  _id uuid, _expected_version integer, _name text, _category_id uuid, _price bigint,
  _agreement jsonb, _media jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store public.stores%ROWTYPE;
  v_before public.marketplace_services%ROWTYPE;
  v_after public.marketplace_services%ROWTYPE;
  v_key text;
  v_entry jsonb;
  v_seen_paths text[] := ARRAY[]::text[];
  v_media_max int;
  v_image_max bigint;
  v_video_max bigint;
  v_duration_max bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF (_id IS NULL) <> (_expected_version IS NULL) THEN RAISE EXCEPTION 'VERSION_REQUIRED'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR SHARE;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;

  -- Batas yang dikonfigurasi admin, dengan fallback ke default yang sama seperti
  -- sebelumnya sehingga tidak ada perubahan perilaku sampai admin mengubahnya.
  v_media_max := public.setting_int('marketplace_media_max', 5)::int;
  v_image_max := public.setting_int('marketplace_image_max_mb', 5) * 1048576;
  v_video_max := public.setting_int('marketplace_video_max_mb', 25) * 1048576;
  v_duration_max := public.setting_int('marketplace_max_duration_days', 365);
  IF v_media_max NOT BETWEEN 1 AND 10
    OR v_image_max NOT BETWEEN 1048576 AND 20971520
    OR v_video_max NOT BETWEEN 1048576 AND 104857600
    OR v_duration_max NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'INVALID_CHECKOUT_SETTINGS';
  END IF;

  IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 3 AND 160
    OR _price IS NULL OR _price NOT BETWEEN 1 AND 1000000000 THEN
    RAISE EXCEPTION 'INVALID_LISTING';
  END IF;
  PERFORM 1 FROM public.categories WHERE id = _category_id AND kind = 'service'
    AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CATEGORY'; END IF;
  IF _agreement IS NULL OR jsonb_typeof(_agreement) <> 'object'
    OR NOT (_agreement ?& ARRAY['scope','exclusions','deliverable','requirements','durationDays','revisionLimit'])
    OR _agreement - ARRAY['scope','exclusions','deliverable','requirements','durationDays','revisionLimit'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'INVALID_AGREEMENT';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['scope','exclusions','deliverable','requirements'] LOOP
    IF jsonb_typeof(jsonb_extract_path(_agreement, v_key)) <> 'string'
      OR length(btrim(jsonb_extract_path_text(_agreement, v_key))) NOT BETWEEN (CASE WHEN v_key = 'scope' THEN 10 ELSE 3 END) AND 5000 THEN
      RAISE EXCEPTION 'INVALID_AGREEMENT';
    END IF;
    _agreement := jsonb_set(_agreement, ARRAY[v_key], to_jsonb(btrim(jsonb_extract_path_text(_agreement, v_key))));
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['durationDays','revisionLimit'] LOOP
    IF jsonb_typeof(jsonb_extract_path(_agreement, v_key)) <> 'number' THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
    IF (jsonb_extract_path_text(_agreement, v_key))::numeric <> trunc((jsonb_extract_path_text(_agreement, v_key))::numeric)
      OR (jsonb_extract_path_text(_agreement, v_key))::numeric NOT BETWEEN (CASE WHEN v_key = 'durationDays' THEN 1 ELSE 0 END) AND 2147483647 THEN
      RAISE EXCEPTION 'INVALID_AGREEMENT';
    END IF;
  END LOOP;
  -- Durasi mengikuti batas yang dikonfigurasi admin.
  IF (jsonb_extract_path_text(_agreement, 'durationDays'))::bigint > v_duration_max THEN
    RAISE EXCEPTION 'DURATION_EXCEEDS_LIMIT';
  END IF;

  IF _media IS NULL THEN _media := '[]'::jsonb; END IF;
  IF jsonb_typeof(_media) <> 'array' OR jsonb_array_length(_media) > v_media_max THEN
    RAISE EXCEPTION 'INVALID_MEDIA';
  END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(_media) LOOP
    IF jsonb_typeof(v_entry) <> 'object'
      OR v_entry - ARRAY['kind','path','alt','mime','size'] <> '{}'::jsonb
      OR v_entry->>'kind' NOT IN ('image','video')
      OR v_entry->>'path' IS NULL OR length(v_entry->>'path') NOT BETWEEN 5 AND 400
      OR v_entry->>'path' NOT LIKE 'service-media/%'
      OR position('..' IN v_entry->>'path') > 0
      OR v_entry->>'alt' IS NULL OR length(btrim(v_entry->>'alt')) NOT BETWEEN 1 AND 160
      OR v_entry->>'mime' NOT IN ('image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm')
      OR jsonb_typeof(v_entry->'size') <> 'number' THEN
      RAISE EXCEPTION 'INVALID_MEDIA';
    END IF;
    -- Ukuran mengikuti batas yang dikonfigurasi admin.
    IF (v_entry->>'kind' = 'image' AND ((v_entry->>'mime') NOT LIKE 'image/%' OR (v_entry->>'size')::numeric > v_image_max))
      OR (v_entry->>'kind' = 'video' AND ((v_entry->>'mime') NOT LIKE 'video/%' OR (v_entry->>'size')::numeric > v_video_max)) THEN
      RAISE EXCEPTION 'INVALID_MEDIA';
    END IF;
    IF (v_entry->>'path') = ANY(v_seen_paths) THEN RAISE EXCEPTION 'INVALID_MEDIA'; END IF;
    v_seen_paths := array_append(v_seen_paths, v_entry->>'path');
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'service-media' AND o.name = v_entry->>'path'
    ) THEN RAISE EXCEPTION 'MEDIA_NOT_FOUND'; END IF;
  END LOOP;

  IF _id IS NULL THEN
    INSERT INTO public.marketplace_services(store_id, category_id, name, price, agreement, media)
      VALUES (v_store.id, _category_id, btrim(_name), _price, _agreement, _media) RETURNING * INTO v_after;
  ELSE
    SELECT * INTO v_before FROM public.marketplace_services WHERE id = _id AND store_id = v_store.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_before.version <> _expected_version THEN RAISE EXCEPTION 'STALE_LISTING'; END IF;
    UPDATE public.marketplace_services SET
      category_id = _category_id, name = btrim(_name), price = _price,
      agreement = _agreement, media = _media,
      status = 'draft', version = version + 1, updated_at = now(),
      moderation_note = NULL, reviewed_by = NULL, reviewed_at = NULL
    WHERE id = _id RETURNING * INTO v_after;
  END IF;

  INSERT INTO public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, before_json, after_json)
  VALUES (v_user, 'seller',
    CASE WHEN _id IS NULL THEN 'marketplace_service.create' ELSE 'marketplace_service.update' END,
    'marketplace_service', v_after.id, to_jsonb(v_before), to_jsonb(v_after));
  RETURN jsonb_build_object('id', v_after.id, 'version', v_after.version, 'status', v_after.status);
END; $$;

REVOKE ALL ON FUNCTION public.save_marketplace_service_draft(uuid,integer,text,uuid,bigint,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_marketplace_service_draft(uuid,integer,text,uuid,bigint,jsonb,jsonb) TO authenticated;
