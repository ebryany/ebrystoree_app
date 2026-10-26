-- JDO-07 disetujui owner: seller boleh mengirim hasil sebagai berkas, bukan
-- hanya tautan/catatan. Semua artifact privat: bucket tertutup, akses dibatasi
-- pembeli pesanan dan seller pemilik toko, unduhan lewat signed URL.
-- Migration baru; tidak mengedit migration yang sudah diterapkan.

-- 1. Bucket privat. Idempoten dan menolak manifest yang berbeda diam-diam.
DO $$
DECLARE actual storage.buckets%ROWTYPE;
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'service-deliveries', 'service-deliveries', false, 26214400,
    ARRAY[
      'application/pdf','application/zip','text/plain',
      'image/png','image/jpeg','image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]::text[]
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO STRICT actual FROM storage.buckets WHERE id = 'service-deliveries' FOR UPDATE;
  IF actual.public IS DISTINCT FROM false
    OR actual.file_size_limit IS DISTINCT FROM 26214400
    OR actual.allowed_mime_types IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_DELIVERY_BUCKET_CONFLICT';
  END IF;
END;
$$;

-- 2. Kolom artifact pada delivery.
ALTER TABLE public.marketplace_service_deliveries
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

ALTER TABLE public.marketplace_service_deliveries
  DROP CONSTRAINT IF EXISTS marketplace_service_deliveries_kind_check,
  DROP CONSTRAINT IF EXISTS marketplace_service_deliveries_check,
  DROP CONSTRAINT IF EXISTS marketplace_service_deliveries_url_check;

ALTER TABLE public.marketplace_service_deliveries
  ADD CONSTRAINT marketplace_service_deliveries_kind_check
    CHECK (kind IN ('link','note','file')),
  ADD CONSTRAINT marketplace_service_deliveries_payload_check
    CHECK (
      (kind = 'link' AND url IS NOT NULL AND note IS NULL AND storage_path IS NULL)
      OR (kind = 'note' AND note IS NOT NULL AND url IS NULL AND storage_path IS NULL)
      OR (kind = 'file' AND storage_path IS NOT NULL AND url IS NULL AND note IS NULL)
    ),
  ADD CONSTRAINT marketplace_service_deliveries_url_check
    CHECK (url IS NULL OR (url ~ '^https://' AND length(url) <= 2000)),
  ADD CONSTRAINT marketplace_service_deliveries_file_check
    CHECK (
      storage_path IS NULL
      OR (length(storage_path) BETWEEN 5 AND 400
          AND length(original_name) BETWEEN 1 AND 255
          AND length(mime_type) BETWEEN 3 AND 120
          AND file_size BETWEEN 1 AND 26214400)
    );

-- 3. Policy storage.objects. Path selalu diawali order_id, sehingga keanggotaan
--    pesanan yang menentukan akses, bukan folder user. Cast UUID dibungkus
--    helper agar path cacat ditolak sebagai false, bukan melempar error cast.
CREATE OR REPLACE FUNCTION public.try_uuid(_text text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN _text::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.try_uuid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_uuid(text) TO authenticated;

DROP POLICY IF EXISTS "service_delivery_insert_seller" ON storage.objects;
DROP POLICY IF EXISTS "service_delivery_read_participant" ON storage.objects;
DROP POLICY IF EXISTS "service_delivery_delete_seller" ON storage.objects;

CREATE POLICY "service_delivery_insert_seller" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'service-deliveries'
    AND public.is_service_order_seller(public.try_uuid((storage.foldername(name))[1]))
  );

CREATE POLICY "service_delivery_read_participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'service-deliveries'
    AND (
      public.is_service_order_buyer(public.try_uuid((storage.foldername(name))[1]))
      OR public.is_service_order_seller(public.try_uuid((storage.foldername(name))[1]))
      OR public.has_permission(auth.uid(), 'orders.view')
    )
  );

CREATE POLICY "service_delivery_delete_seller" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'service-deliveries'
    AND public.is_service_order_seller(public.try_uuid((storage.foldername(name))[1]))
  );

-- 4. Signature delivery baru dengan artifact. Versi 5-arg dihapus agar tidak ada
--    jalur bypass yang tidak tervalidasi.
DROP FUNCTION IF EXISTS public.submit_service_delivery(uuid,text,text,text,text);

CREATE FUNCTION public.submit_service_delivery(
  _order_id uuid, _kind text, _url text, _note text, _summary text,
  _storage_path text DEFAULT NULL, _original_name text DEFAULT NULL,
  _mime_type text DEFAULT NULL, _file_size bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_store public.stores%ROWTYPE;
  v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
  v_version integer; v_delivery public.marketplace_service_deliveries%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _kind IS NULL OR _kind NOT IN ('link','note','file') THEN RAISE EXCEPTION 'INVALID_DELIVERY'; END IF;
  IF _summary IS NULL OR length(btrim(_summary)) NOT BETWEEN 3 AND 5000 THEN RAISE EXCEPTION 'SUMMARY_REQUIRED'; END IF;
  IF _kind = 'link' THEN
    IF _url IS NULL OR _url !~ '^https://' OR _url ~ '^https://[^/@]*@' OR length(_url) > 2000
      THEN RAISE EXCEPTION 'URL_REQUIRED'; END IF;
  ELSIF _kind = 'note' THEN
    IF _note IS NULL OR length(btrim(_note)) NOT BETWEEN 3 AND 5000 THEN RAISE EXCEPTION 'NOTE_REQUIRED'; END IF;
  ELSE
    -- Berkas wajib berada di prefix order_id dan benar-benar ada di bucket privat.
    IF _storage_path IS NULL OR _storage_path NOT LIKE _order_id::text || '/%'
      OR position('..' IN _storage_path) > 0 OR length(_storage_path) > 400
      THEN RAISE EXCEPTION 'FILE_REQUIRED'; END IF;
    IF _original_name IS NULL OR length(btrim(_original_name)) NOT BETWEEN 1 AND 255
      OR _mime_type IS NULL OR length(btrim(_mime_type)) NOT BETWEEN 3 AND 120
      OR _file_size IS NULL OR _file_size NOT BETWEEN 1 AND 26214400
      THEN RAISE EXCEPTION 'FILE_METADATA_REQUIRED'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'service-deliveries' AND o.name = _storage_path
    ) THEN RAISE EXCEPTION 'FILE_NOT_FOUND'; END IF;
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR SHARE;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_mso.store_id <> v_store.id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status <> 'paid' OR v_mso.complaint_open THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.work_state NOT IN ('in_progress','revision_requested') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.requirements_approved_at IS NULL THEN RAISE EXCEPTION 'REQUIREMENTS_NOT_APPROVED'; END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.marketplace_service_deliveries WHERE order_id = _order_id;
  INSERT INTO public.marketplace_service_deliveries(
    order_id, version, kind, url, note, summary, created_by,
    storage_path, original_name, mime_type, file_size
  ) VALUES (
    _order_id, v_version, _kind,
    CASE WHEN _kind = 'link' THEN btrim(_url) END,
    CASE WHEN _kind = 'note' THEN btrim(_note) END,
    btrim(_summary), v_user,
    CASE WHEN _kind = 'file' THEN btrim(_storage_path) END,
    CASE WHEN _kind = 'file' THEN btrim(_original_name) END,
    CASE WHEN _kind = 'file' THEN btrim(_mime_type) END,
    CASE WHEN _kind = 'file' THEN _file_size END
  ) RETURNING * INTO v_delivery;
  UPDATE public.marketplace_service_orders SET latest_delivery_id = v_delivery.id,
    work_state = 'delivered', updated_at = now() WHERE order_id = _order_id;
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, delivery_id, payload)
    VALUES (_order_id, 'delivery_submitted', v_user, 'seller', v_delivery.id,
      jsonb_build_object('version', v_delivery.version, 'kind', _kind, 'summary', btrim(_summary)));
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'service.delivered', 'Hasil pekerjaan dikirim',
      'Seller mengirim hasil versi ' || v_version || ' untuk pesanan ' || v_order.order_number || '. Tinjau, lalu terima atau minta revisi.', 'order', _order_id);
  RETURN jsonb_build_object('delivery_id', v_delivery.id, 'version', v_delivery.version);
END; $$;

REVOKE ALL ON FUNCTION public.submit_service_delivery(uuid,text,text,text,text,text,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_service_delivery(uuid,text,text,text,text,text,text,text,bigint) TO authenticated;
