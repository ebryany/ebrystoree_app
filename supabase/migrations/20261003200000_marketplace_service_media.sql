-- Jasa Saya: media listing (maksimal 5 gambar/video).
--
-- Kolom media disimpan sebagai jsonb karena media adalah atribut kecil milik satu
-- listing, tidak pernah di-query lintas listing, dan urutannya bermakna. Bentuk
-- entri: {kind, path, alt, mime, size}.
--
-- Batas ditegakkan di SQL, bukan hanya di UI: jumlah maksimal, jenis, bentuk
-- objek, dan path wajib berada di bucket media jasa.

ALTER TABLE public.marketplace_services
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

-- CHECK tidak boleh memuat subquery, jadi bentuk media divalidasi lewat fungsi
-- IMMUTABLE yang mengembalikan true/false. Isinya sama dengan validasi RPC,
-- sehingga baris yang lolos RPC tetap harus lolos constraint ini.
CREATE OR REPLACE FUNCTION public.is_valid_service_media(_media jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _media IS NULL OR jsonb_typeof(_media) <> 'array' THEN false
    WHEN jsonb_array_length(_media) > 5 THEN false
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
          (entry->>'kind' = 'image' AND (entry->>'mime') LIKE 'image/%' AND (entry->>'size')::numeric <= 5242880)
          OR (entry->>'kind' = 'video' AND (entry->>'mime') LIKE 'video/%' AND (entry->>'size')::numeric <= 26214400)
        )
      )
      FROM jsonb_array_elements(_media) AS entry
    )
  END;
$$;

ALTER TABLE public.marketplace_services
  DROP CONSTRAINT IF EXISTS marketplace_services_media_check;

ALTER TABLE public.marketplace_services
  ADD CONSTRAINT marketplace_services_media_check CHECK (public.is_valid_service_media(media));

-- Bucket privat media jasa. Gambar sampai 5 MB, video sampai 25 MB; batas bucket
-- memakai nilai terbesar, sedangkan batas per jenis ditegakkan di constraint kolom.
DO $$
DECLARE actual storage.buckets%ROWTYPE;
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'service-media', 'service-media', false, 26214400,
    ARRAY['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']::text[]
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO STRICT actual FROM storage.buckets WHERE id = 'service-media' FOR UPDATE;
  IF actual.public IS DISTINCT FROM false
    OR actual.file_size_limit IS DISTINCT FROM 26214400
    OR actual.allowed_mime_types IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_MEDIA_BUCKET_CONFLICT';
  END IF;
END;
$$;

-- RPC draft diperluas menerima media. Signature berubah, jadi fungsi lama di-drop
-- dan dibuat ulang; grant diatur ulang agar tidak ada jalur lama tanpa validasi.
DROP FUNCTION IF EXISTS public.save_marketplace_service_draft(uuid,integer,text,uuid,bigint,jsonb);

CREATE FUNCTION public.save_marketplace_service_draft(
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF (_id IS NULL) <> (_expected_version IS NULL) THEN RAISE EXCEPTION 'VERSION_REQUIRED'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR SHARE;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
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

  -- Media: bentuk, jenis, ukuran, dan keberadaan objek di storage.
  IF _media IS NULL THEN _media := '[]'::jsonb; END IF;
  IF jsonb_typeof(_media) <> 'array' OR jsonb_array_length(_media) > 5 THEN
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
    IF (v_entry->>'kind' = 'image' AND ((v_entry->>'mime') NOT LIKE 'image/%' OR (v_entry->>'size')::numeric > 5242880))
      OR (v_entry->>'kind' = 'video' AND ((v_entry->>'mime') NOT LIKE 'video/%' OR (v_entry->>'size')::numeric > 26214400)) THEN
      RAISE EXCEPTION 'INVALID_MEDIA';
    END IF;
    IF (v_entry->>'path') = ANY(v_seen_paths) THEN RAISE EXCEPTION 'INVALID_MEDIA'; END IF;
    v_seen_paths := array_append(v_seen_paths, v_entry->>'path');
    -- Objek harus benar-benar ada; path tanpa objek akan menghasilkan galeri rusak.
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

-- Quote checkout juga mengembalikan media supaya pembeli melihat gambaran hasil
-- sebelum menyetujui kesepakatan. Hanya field publik media yang dikirim.
CREATE OR REPLACE FUNCTION public.quote_marketplace_service_order(_service_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_listing public.marketplace_services%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_category public.categories%ROWTYPE;
  v_fee bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF public.has_permission(v_user, 'orders.create') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF COALESCE((SELECT value = 'true'::jsonb FROM public.system_settings WHERE key = 'feature_checkout'), true) IS NOT TRUE THEN RAISE EXCEPTION 'CHECKOUT_DISABLED'; END IF;
  SELECT * INTO v_listing FROM public.marketplace_services WHERE id = _service_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE id = v_listing.store_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  IF v_store.owner_id = v_user THEN RAISE EXCEPTION 'SELF_PURCHASE_DENIED'; END IF;
  SELECT * INTO v_category FROM public.categories WHERE id = v_listing.category_id
    AND kind = 'service' AND is_active AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  IF (v_listing.agreement->>'durationDays')::bigint NOT BETWEEN 1 AND 36500 THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  v_fee := public.setting_int('admin_fee', 0);
  IF v_fee NOT BETWEEN 0 AND 1000000000 THEN RAISE EXCEPTION 'INVALID_CHECKOUT_SETTINGS'; END IF;
  RETURN jsonb_build_object('id', v_listing.id, 'name', v_listing.name, 'price', v_listing.price,
    'agreement', v_listing.agreement, 'media', v_listing.media, 'version', v_listing.version,
    'store', jsonb_build_object('name', v_store.name, 'slug', v_store.slug),
    'category', jsonb_build_object('name', v_category.name, 'slug', v_category.slug),
    'adminFee', v_fee, 'total', v_listing.price + v_fee);
END; $$;
REVOKE ALL ON FUNCTION public.quote_marketplace_service_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_marketplace_service_order(uuid) TO authenticated;
