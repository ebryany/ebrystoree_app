-- No marketplace_service order discriminator until payment/release guards are verified.
CREATE TABLE public.marketplace_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  category_id uuid NOT NULL REFERENCES public.categories(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 160),
  price bigint NOT NULL CHECK (price BETWEEN 1 AND 1000000000),
  agreement jsonb NOT NULL CHECK (jsonb_typeof(agreement) = 'object'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  moderation_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('approved', 'rejected')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (moderation_note IS NULL OR length(btrim(moderation_note)) BETWEEN 5 AND 1000)
);
CREATE INDEX marketplace_services_store_created ON public.marketplace_services(store_id, created_at DESC, id);
CREATE INDEX marketplace_services_review_created ON public.marketplace_services(created_at, id) WHERE status = 'in_review';
ALTER TABLE public.marketplace_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_services FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.marketplace_services TO authenticated;
GRANT ALL ON public.marketplace_services TO service_role;
CREATE POLICY marketplace_services_owner_read ON public.marketplace_services
  FOR SELECT TO authenticated USING (store_id = public.my_store_id());
CREATE POLICY marketplace_services_staff_read ON public.marketplace_services
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'services.view'));

CREATE FUNCTION public.save_marketplace_service_draft(
  _id uuid, _expected_version integer, _name text, _category_id uuid, _price bigint, _agreement jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store public.stores%ROWTYPE;
  v_before public.marketplace_services%ROWTYPE;
  v_after public.marketplace_services%ROWTYPE;
  v_key text;
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
  IF _id IS NULL THEN
    INSERT INTO public.marketplace_services(store_id, category_id, name, price, agreement)
      VALUES (v_store.id, _category_id, btrim(_name), _price, _agreement) RETURNING * INTO v_after;
  ELSE
    SELECT * INTO v_before FROM public.marketplace_services WHERE id = _id AND store_id = v_store.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_before.version <> _expected_version THEN RAISE EXCEPTION 'STALE_LISTING'; END IF;
    IF v_before.status NOT IN ('draft','rejected','approved') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    UPDATE public.marketplace_services SET category_id = _category_id, name = btrim(_name), price = _price,
      agreement = _agreement, status = 'draft', version = version + 1, moderation_note = NULL,
      reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
      WHERE id = _id RETURNING * INTO v_after;
  END IF;
  INSERT INTO public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, before_json, after_json)
    VALUES (v_user, 'seller', 'marketplace_service.save_draft', 'marketplace_service', v_after.id,
      CASE WHEN _id IS NULL THEN NULL ELSE to_jsonb(v_before) END, to_jsonb(v_after));
  RETURN jsonb_build_object('id', v_after.id, 'version', v_after.version);
END;
$$;

CREATE FUNCTION public.transition_marketplace_service(
  _id uuid, _expected_version integer, _action text, _reason text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_before public.marketplace_services%ROWTYPE;
  v_after public.marketplace_services%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_moderation boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _action IS NULL OR _action NOT IN ('submit','archive','approve','reject') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  v_moderation := _action IN ('approve','reject');
  IF v_moderation AND public.has_permission(v_user, 'services.update') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_moderation AND (_reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 5 AND 1000) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  -- Store first matches save_draft; catalog locks do not touch financial rows.
  SELECT s.* INTO v_store FROM public.stores s JOIN public.marketplace_services m ON m.store_id = s.id
    WHERE m.id = _id FOR SHARE OF s;
  IF NOT FOUND OR (NOT v_moderation AND v_store.owner_id <> v_user) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_moderation AND v_store.owner_id = v_user THEN RAISE EXCEPTION 'SELF_MODERATION_DENIED'; END IF;
  IF _action <> 'archive' AND v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  SELECT * INTO v_before FROM public.marketplace_services WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _expected_version IS NULL OR v_before.version <> _expected_version THEN RAISE EXCEPTION 'STALE_LISTING'; END IF;
  IF (_action = 'submit' AND v_before.status NOT IN ('draft','rejected'))
    OR (v_moderation AND v_before.status <> 'in_review')
    OR (_action = 'archive' AND v_before.status = 'archived') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF _action IN ('submit','approve') THEN
    PERFORM 1 FROM public.categories WHERE id = v_before.category_id AND kind = 'service'
      AND is_active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CATEGORY'; END IF;
  END IF;
  UPDATE public.marketplace_services SET
    status = CASE _action WHEN 'submit' THEN 'in_review' WHEN 'archive' THEN 'archived'
      WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
    version = version + 1, moderation_note = CASE WHEN v_moderation THEN btrim(_reason) ELSE NULL END,
    reviewed_by = CASE WHEN v_moderation THEN v_user ELSE NULL END,
    reviewed_at = CASE WHEN v_moderation THEN now() ELSE NULL END, updated_at = now()
    WHERE id = _id RETURNING * INTO v_after;
  INSERT INTO public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
    VALUES (v_user, CASE WHEN v_moderation THEN 'admin' ELSE 'seller' END,
      'marketplace_service.' || _action, 'marketplace_service', _id,
      to_jsonb(v_before), to_jsonb(v_after), CASE WHEN v_moderation THEN btrim(_reason) ELSE NULL END);
  RETURN jsonb_build_object('id', v_after.id, 'version', v_after.version);
END;
$$;

-- Hard stop, not a mutable setting: approval never publishes or opens payment.
CREATE FUNCTION public.create_marketplace_service_order(_service_id uuid, _idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  RAISE EXCEPTION 'MARKETPLACE_SERVICE_DISABLED';
END;
$$;
REVOKE ALL ON FUNCTION public.save_marketplace_service_draft(uuid,integer,text,uuid,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_marketplace_service(uuid,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_marketplace_service_order(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_marketplace_service_draft(uuid,integer,text,uuid,bigint,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_service(uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_service_order(uuid,text) TO authenticated;

-- ================= KONTRAK ORDER JASA =================
-- create_marketplace_service_order masih MARKETPLACE_SERVICE_DISABLED, sehingga tabel
-- ini tidak berisi baris sampai aktivasi diotorisasi. Semua RPC lifecycle di bawah
-- mengunci order lebih dahulu (urutan lock: orders -> marketplace_service_orders ->
-- delivery/event terkait) dan memvalidasi ownership di SQL, bukan di client.

CREATE TABLE public.marketplace_service_orders (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.marketplace_services(id),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  agreement jsonb NOT NULL CHECK (jsonb_typeof(agreement) = 'object'),
  agreement_version integer NOT NULL CHECK (agreement_version > 0),
  requirements jsonb,
  requirements_version integer NOT NULL DEFAULT 1 CHECK (requirements_version > 0),
  requirements_approved_at timestamptz,
  ready_at timestamptz,
  due_at timestamptz,
  revision_limit integer NOT NULL CHECK (revision_limit >= 0),
  revision_used integer NOT NULL DEFAULT 0 CHECK (revision_used >= 0),
  latest_delivery_id uuid,
  accepted_delivery_id uuid,
  accepted_at timestamptz,
  work_state text NOT NULL DEFAULT 'awaiting_requirements'
    CHECK (work_state IN ('awaiting_requirements','in_progress','delivered','revision_requested','accepted','complaint_open','refunded')),
  prior_work_state text,
  prior_order_status text,
  complaint_open boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (revision_used <= revision_limit),
  CHECK ((accepted_delivery_id IS NULL) = (accepted_at IS NULL)),
  CHECK (NOT complaint_open OR accepted_delivery_id IS NULL)
);
CREATE INDEX marketplace_service_orders_store ON public.marketplace_service_orders(store_id, created_at DESC);

CREATE TABLE public.marketplace_service_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL CHECK (kind IN ('link','note')),
  url text CHECK (url ~ '^https://' AND length(url) <= 2000),
  note text,
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 3 AND 5000),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version),
  CHECK ((kind = 'link') = (url IS NOT NULL))
);
CREATE INDEX marketplace_service_deliveries_order ON public.marketplace_service_deliveries(order_id, version DESC);

ALTER TABLE public.marketplace_service_orders
  ADD CONSTRAINT marketplace_service_orders_latest_delivery_fk FOREIGN KEY (latest_delivery_id)
    REFERENCES public.marketplace_service_deliveries(id) ON DELETE CASCADE,
  ADD CONSTRAINT marketplace_service_orders_accepted_delivery_fk FOREIGN KEY (accepted_delivery_id)
    REFERENCES public.marketplace_service_deliveries(id) ON DELETE CASCADE;

-- Event order immutable; actor diturunkan server, bukan dikirim client.
CREATE TABLE public.marketplace_service_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (length(btrim(event_type)) BETWEEN 3 AND 60),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('buyer','seller','admin')),
  delivery_id uuid REFERENCES public.marketplace_service_deliveries(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_service_events_order ON public.marketplace_service_events(order_id, id);

GRANT SELECT ON public.marketplace_service_orders TO authenticated;
GRANT SELECT ON public.marketplace_service_deliveries TO authenticated;
GRANT SELECT ON public.marketplace_service_events TO authenticated;
GRANT ALL ON public.marketplace_service_orders TO service_role;
GRANT ALL ON public.marketplace_service_deliveries TO service_role;
GRANT ALL ON public.marketplace_service_events TO service_role;
ALTER TABLE public.marketplace_service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_service_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_service_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_service_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_service_deliveries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.marketplace_service_events FROM authenticated;

-- Helper RLS: subquery orders di policy tidak bisa dipakai seller karena RLS orders
-- membatasi ke pemilik order, jadi pemeriksaan lewat SECURITY DEFINER.
CREATE FUNCTION public.is_service_order_buyer(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = _order_id AND user_id = auth.uid());
$$;
CREATE FUNCTION public.is_service_order_seller(_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.marketplace_service_orders m
    JOIN public.stores s ON s.id = m.store_id
    WHERE m.order_id = _order_id AND s.owner_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_service_order_buyer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_service_order_seller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_service_order_buyer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_service_order_seller(uuid) TO authenticated;

CREATE POLICY marketplace_service_orders_read ON public.marketplace_service_orders
  FOR SELECT TO authenticated USING (
    public.is_service_order_buyer(order_id) OR public.is_service_order_seller(order_id)
    OR public.has_permission(auth.uid(), 'orders.view'));
CREATE POLICY marketplace_service_deliveries_read ON public.marketplace_service_deliveries
  FOR SELECT TO authenticated USING (
    public.is_service_order_buyer(order_id) OR public.is_service_order_seller(order_id)
    OR public.has_permission(auth.uid(), 'orders.view'));
CREATE POLICY marketplace_service_events_read ON public.marketplace_service_events
  FOR SELECT TO authenticated USING (
    public.is_service_order_buyer(order_id) OR public.is_service_order_seller(order_id)
    OR public.has_permission(auth.uid(), 'orders.view'));

-- Seller menyetujui requirements buyer; ready_at/due_at dicatat sekali.
CREATE FUNCTION public.approve_service_requirements(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_store public.stores%ROWTYPE;
  v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_store FROM public.stores WHERE owner_id = v_user FOR SHARE;
  IF NOT FOUND OR v_store.status <> 'active' THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_mso.store_id <> v_store.id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.complaint_open THEN RAISE EXCEPTION 'COMPLAINT_ACTIVE'; END IF;
  IF v_mso.work_state <> 'awaiting_requirements' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.agreement ? 'durationDays' IS NOT TRUE
    OR jsonb_typeof(jsonb_extract_path_text(v_mso.agreement, 'durationDays')) <> 'number' THEN RAISE EXCEPTION 'INVALID_AGREEMENT'; END IF;
  UPDATE public.marketplace_service_orders SET requirements_approved_at = now(),
    ready_at = now(), due_at = now() + ((jsonb_extract_path_text(agreement, 'durationDays'))::int || ' days')::interval,
    work_state = 'in_progress', updated_at = now()
    WHERE order_id = _order_id RETURNING * INTO v_mso;
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
    VALUES (_order_id, 'requirements_approved', v_user, 'seller',
      jsonb_build_object('requirements_version', v_mso.requirements_version, 'due_at', v_mso.due_at));
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'service.requirements_approved', 'Requirements disetujui seller',
      'Seller menyetujui kebutuhan pesanan ' || v_order.order_number || '. Pengerjaan mengikuti agreement yang Anda setujui.', 'order', _order_id);
  RETURN jsonb_build_object('status', v_mso.work_state, 'due_at', v_mso.due_at);
END; $$;

-- Seller mengirim hasil immutable berversi; artifact upload tetap tertutup (JDO-07),
-- jadi kontrak delivery hanya URL HTTPS tanpa credential atau catatan hasil.
CREATE FUNCTION public.submit_service_delivery(_order_id uuid, _kind text, _url text, _note text, _summary text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_store public.stores%ROWTYPE;
  v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
  v_version integer; v_delivery public.marketplace_service_deliveries%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _kind IS NULL OR _kind NOT IN ('link','note') THEN RAISE EXCEPTION 'INVALID_DELIVERY'; END IF;
  IF _summary IS NULL OR length(btrim(_summary)) NOT BETWEEN 3 AND 5000 THEN RAISE EXCEPTION 'SUMMARY_REQUIRED'; END IF;
  IF _kind = 'link' THEN
    IF _url IS NULL OR _url !~ '^https://' OR _url ~ '^https://[^/@]*@' OR length(_url) > 2000
      THEN RAISE EXCEPTION 'URL_REQUIRED'; END IF;
  ELSE
    IF _note IS NULL OR length(btrim(_note)) NOT BETWEEN 3 AND 5000 THEN RAISE EXCEPTION 'NOTE_REQUIRED'; END IF;
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
  INSERT INTO public.marketplace_service_deliveries(order_id, version, kind, url, note, summary, created_by)
    VALUES (_order_id, v_version, _kind,
      CASE WHEN _kind = 'link' THEN btrim(_url) END, CASE WHEN _kind = 'note' THEN btrim(_note) END,
      btrim(_summary), v_user)
    RETURNING * INTO v_delivery;
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

-- Buyer meminta revisi terhadap delivery terakhir; jatah habis diarahkan ke komplain.
CREATE FUNCTION public.request_service_revision(_order_id uuid, _delivery_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status <> 'paid' OR v_mso.complaint_open OR v_mso.accepted_delivery_id IS NOT NULL
    THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.work_state <> 'delivered' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.latest_delivery_id IS DISTINCT FROM _delivery_id THEN RAISE EXCEPTION 'DELIVERY_SUPERSEDED'; END IF;
  IF v_mso.revision_used >= v_mso.revision_limit THEN RAISE EXCEPTION 'REVISION_ALLOWANCE_EXHAUSTED'; END IF;
  UPDATE public.marketplace_service_orders SET work_state = 'revision_requested',
    revision_used = revision_used + 1, updated_at = now()
    WHERE order_id = _order_id RETURNING * INTO v_mso;
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, delivery_id, payload)
    VALUES (_order_id, 'revision_requested', v_user, 'buyer', _delivery_id,
      jsonb_build_object('reason', btrim(_reason), 'revision_used', v_mso.revision_used));
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    SELECT s.owner_id, 'service.revision_requested', 'Revisi diminta pembeli',
      'Pembeli meminta revisi pesanan ' || v_order.order_number || ': ' || btrim(_reason), 'order', _order_id
    FROM public.stores s WHERE s.id = v_mso.store_id;
  RETURN jsonb_build_object('status', v_mso.work_state, 'revision_used', v_mso.revision_used);
END; $$;

-- Acceptance hanya buyer, hanya delivery terakhir, dan melepas credit di transaksi
-- yang sama. Seller/admin tidak punya jalur acceptance.
CREATE FUNCTION public.accept_service_delivery(_order_id uuid, _delivery_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
  v_delivery public.marketplace_service_deliveries%ROWTYPE; v_credit jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_mso.accepted_delivery_id IS NOT NULL THEN
    IF v_mso.accepted_delivery_id = _delivery_id THEN
      RETURN jsonb_build_object('status', 'already_accepted', 'delivery_id', _delivery_id);
    END IF;
    RAISE EXCEPTION 'DELIVERY_SUPERSEDED';
  END IF;
  IF v_mso.complaint_open THEN RAISE EXCEPTION 'COMPLAINT_ACTIVE'; END IF;
  IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.work_state <> 'delivered' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF v_mso.latest_delivery_id IS DISTINCT FROM _delivery_id THEN RAISE EXCEPTION 'DELIVERY_SUPERSEDED'; END IF;
  SELECT * INTO v_delivery FROM public.marketplace_service_deliveries
    WHERE id = _delivery_id AND order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.marketplace_service_orders SET accepted_delivery_id = _delivery_id, accepted_at = now(),
    work_state = 'accepted', updated_at = now() WHERE order_id = _order_id;
  UPDATE public.orders SET status = 'completed', completed_at = now() WHERE id = _order_id;
  INSERT INTO public.order_status_histories(order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (_order_id, 'paid', 'completed', v_user, 'customer',
      'Pembeli menerima hasil pekerjaan versi ' || v_delivery.version || '. Dana seller dilepas.');
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, delivery_id, payload)
    VALUES (_order_id, 'accepted', v_user, 'buyer', _delivery_id, jsonb_build_object('version', v_delivery.version));
  v_credit := public.credit_seller_earnings(_order_id);
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    SELECT s.owner_id, 'service.accepted', 'Hasil diterima pembeli',
      'Pembeli menerima hasil pesanan ' || v_order.order_number || '. Pendapatan dilepas ke saldo toko.', 'order', _order_id
    FROM public.stores s WHERE s.id = v_mso.store_id;
  RETURN jsonb_build_object('status', 'accepted', 'delivery_id', _delivery_id, 'credit', v_credit);
END; $$;

-- Komplain buyer pra-acceptance membekukan release sampai admin memutuskan.
CREATE FUNCTION public.open_service_complaint(_order_id uuid, _reason text, _delivery_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_mso.complaint_open THEN RAISE EXCEPTION 'COMPLAINT_ACTIVE'; END IF;
  IF v_mso.accepted_delivery_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ACCEPTED'; END IF;
  IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF _delivery_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.marketplace_service_deliveries
    WHERE id = _delivery_id AND order_id = _order_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.marketplace_service_orders SET complaint_open = true,
    prior_work_state = CASE WHEN work_state = 'complaint_open' THEN prior_work_state ELSE work_state END,
    prior_order_status = v_order.status, updated_at = now() WHERE order_id = _order_id;
  INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, delivery_id, payload)
    VALUES (_order_id, 'complaint_opened', v_user, 'buyer', _delivery_id, jsonb_build_object('reason', btrim(_reason)));
  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
    VALUES ('review_service_complaint', 'order', _order_id,
      'Tinjau komplain jasa ' || v_order.order_number, btrim(_reason), 'high')
    ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
  INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
    SELECT s.owner_id, 'service.complaint_opened', 'Komplain pembeli',
      'Pembeli mengajukan komplain pesanan ' || v_order.order_number || '. Admin akan meninjau; pencairan ditahan.', 'order', _order_id
    FROM public.stores s WHERE s.id = v_mso.store_id;
  RETURN jsonb_build_object('status', 'complaint_open');
END; $$;

-- Keputusan admin atas komplain: lanjut pekerjaan atau full refund melalui
-- pipeline refund existing (review/process tetap berjalan di jalurnya).
CREATE FUNCTION public.resolve_service_complaint(_order_id uuid, _decision text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_order public.orders%ROWTYPE; v_mso public.marketplace_service_orders%ROWTYPE;
  v_pay record; v_refund_id uuid; v_work text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('resume','refund') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF _decision = 'resume' THEN
    IF NOT public.has_permission(v_user, 'orders.update') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user, 'refunds.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.order_type <> 'marketplace_service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_mso FROM public.marketplace_service_orders WHERE order_id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT v_mso.complaint_open THEN RAISE EXCEPTION 'NO_COMPLAINT'; END IF;
  IF v_mso.accepted_delivery_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_ACCEPTED'; END IF;
  IF _decision = 'resume' THEN
    IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    v_work := v_mso.prior_work_state;
    IF v_work IS NULL OR v_work NOT IN ('awaiting_requirements','in_progress','delivered','revision_requested')
      THEN v_work := 'in_progress'; END IF;
    UPDATE public.marketplace_service_orders SET complaint_open = false, work_state = v_work,
      updated_at = now() WHERE order_id = _order_id;
    INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
      VALUES (_order_id, 'complaint_resumed', v_user, 'admin', jsonb_build_object('reason', btrim(_reason), 'work_state', v_work));
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'service.complaint_resumed', 'Komplain ditindaklanjuti',
        'Komplain pesanan ' || v_order.order_number || ' ditinjau admin. Pekerjaan dilanjutkan sesuai agreement.', 'order', _order_id);
  ELSE
    IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    SELECT * INTO v_pay FROM public.payments WHERE order_id = _order_id AND status = 'paid'
      ORDER BY paid_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_PAID_PAYMENT'; END IF;
    INSERT INTO public.refunds (order_id, payment_id, customer_id, amount, reason)
      VALUES (_order_id, v_pay.id, v_order.user_id, v_pay.paid_amount, 'Komplain jasa: ' || btrim(_reason))
      RETURNING id INTO v_refund_id;
    UPDATE public.orders SET status = 'refund_requested' WHERE id = _order_id;
    UPDATE public.payments SET status = 'refund_requested' WHERE id = v_pay.id;
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
      VALUES (_order_id, v_order.status, 'refund_requested', v_user, 'admin',
        'Komplain jasa diputuskan refund penuh.', btrim(_reason));
    INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('review_refund', 'refund', v_refund_id, 'Review refund order ' || v_order.order_number, btrim(_reason), 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
    PERFORM public.notify_payment_staff('refund.requested', 'Refund komplain jasa',
      'Order ' || v_order.order_number || ' direfund karena komplain.', v_pay.id);
    INSERT INTO public.marketplace_service_events(order_id, event_type, actor_id, actor_role, payload)
      VALUES (_order_id, 'refund_requested', v_user, 'admin',
        jsonb_build_object('reason', btrim(_reason), 'refund_id', v_refund_id));
    INSERT INTO public.notifications(recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'refund_requested', 'Refund diajukan admin',
        'Komplain pesanan ' || v_order.order_number || ' disetujui untuk refund penuh dan masuk proses finance.', 'order', _order_id);
  END IF;
  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = btrim(_reason)
    WHERE task_type = 'review_service_complaint' AND source_type = 'order' AND source_id = _order_id
      AND status IN ('open','in_progress','blocked');
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
    VALUES (v_user, 'admin', 'service_complaint.' || _decision, 'order', _order_id,
      jsonb_build_object('complaint_open', true, 'work_state', v_mso.work_state),
      jsonb_build_object('decision', _decision), btrim(_reason));
  RETURN jsonb_build_object('status', CASE WHEN _decision = 'resume' THEN 'resumed' ELSE 'refund_requested' END,
    'refund_id', v_refund_id);
END; $$;

-- Daftar pesanan jasa toko sendiri; RPC menghindari join RLS orders untuk seller.
CREATE FUNCTION public.list_my_service_orders()
RETURNS TABLE (
  order_id uuid, order_number text, order_status text, total bigint, paid_at timestamptz,
  work_state text, complaint_open boolean, due_at timestamptz,
  revision_used integer, revision_limit integer,
  requirements_approved_at timestamptz, accepted_at timestamptz, service_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.order_id, o.order_number, o.status, agg.total, o.paid_at, m.work_state, m.complaint_open,
    m.due_at, m.revision_used, m.revision_limit, m.requirements_approved_at, m.accepted_at, ms.name
  FROM public.marketplace_service_orders m
  JOIN public.orders o ON o.id = m.order_id
  JOIN public.marketplace_services ms ON ms.id = m.service_id
  JOIN (SELECT oi.order_id, SUM(oi.total)::bigint AS total FROM public.order_items oi GROUP BY oi.order_id) agg
    ON agg.order_id = m.order_id
  WHERE m.store_id = public.my_store_id()
  ORDER BY o.created_at DESC;
$$;

-- Detail satu pesanan jasa milik toko sendiri.
CREATE FUNCTION public.get_my_service_order(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store uuid;
BEGIN
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_STORE'; END IF;
  RETURN (
    SELECT jsonb_build_object(
      'order', jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
        'total', agg.total, 'paid_at', o.paid_at, 'created_at', o.created_at),
      'contract', to_jsonb(m), 'service_name', ms.name,
      'deliveries', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.version DESC), '[]'::jsonb)
        FROM public.marketplace_service_deliveries d WHERE d.order_id = m.order_id),
      'events', (SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.id), '[]'::jsonb)
        FROM public.marketplace_service_events e WHERE e.order_id = m.order_id))
    FROM public.marketplace_service_orders m
    JOIN public.orders o ON o.id = m.order_id
    JOIN public.marketplace_services ms ON ms.id = m.service_id
    JOIN (SELECT oi.order_id, SUM(oi.total)::bigint AS total FROM public.order_items oi
      WHERE oi.order_id = _order_id GROUP BY oi.order_id) agg ON agg.order_id = m.order_id
    WHERE m.order_id = _order_id AND m.store_id = v_store);
END; $$;

REVOKE ALL ON FUNCTION public.approve_service_requirements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_service_delivery(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_service_revision(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_service_delivery(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_service_complaint(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_service_complaint(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_service_orders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_service_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_service_requirements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_service_delivery(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_service_revision(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_service_delivery(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_service_complaint(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_complaint(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_service_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_service_order(uuid) TO authenticated;
