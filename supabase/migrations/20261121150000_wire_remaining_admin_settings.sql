-- Menghubungkan pengaturan admin yang tersisa ke fungsi dan trigger database.
-- Setiap pengaturan memakai fallback default yang sama dengan perilaku sebelumnya
-- sehingga sistem tidak berubah sampai admin mengubah nilainya.

-- 1. Helper membaca pengaturan teks dari system_settings.
CREATE OR REPLACE FUNCTION public.setting_text(_key text, _default text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim((SELECT value #>> '{}' FROM public.system_settings WHERE key = _key)), ''),
    _default
  );
$$;

REVOKE ALL ON FUNCTION public.setting_text(text, text) FROM PUBLIC, anon, authenticated;

-- 2. Prefix nomor invoice mengikuti invoice_number_prefix (default 'INV').
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := regexp_replace(
    upper(btrim(public.setting_text('invoice_number_prefix', 'INV'))),
    '[^A-Z0-9-]',
    '',
    'g'
  );
BEGIN
  v_prefix := regexp_replace(v_prefix, '-+$', '');
  IF v_prefix = '' THEN
    v_prefix := 'INV';
  END IF;
  RETURN v_prefix || '-' || to_char(now() AT TIME ZONE 'Asia/Makassar', 'YYYYMMDD') || '-' ||
         lpad(nextval('public.invoice_number_seq')::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon, authenticated;

-- 3. Minimal nominal pesanan mengikuti order_min_amount (default 0 = nonaktif).
CREATE OR REPLACE FUNCTION public.trg_orders_enforce_min_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min bigint := GREATEST(public.setting_int('order_min_amount', 0), 0);
BEGIN
  IF v_min > 0 AND NEW.total < v_min THEN
    RAISE EXCEPTION 'ORDER_BELOW_MINIMUM';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_min_amount ON public.orders;
CREATE TRIGGER orders_enforce_min_amount
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_enforce_min_amount();

-- 4. Batas maksimum jasa aktif per toko mengikuti marketplace_max_active_services.
CREATE OR REPLACE FUNCTION public.transition_marketplace_service(
  _id uuid, _expected_version integer, _action text, _reason text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_before public.marketplace_services%ROWTYPE;
  v_after public.marketplace_services%ROWTYPE;
  v_store public.stores%ROWTYPE;
  v_moderation boolean;
  v_max_active bigint;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _action IS NULL OR _action NOT IN ('submit','archive','approve','reject') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  v_moderation := _action IN ('approve','reject');
  IF v_moderation AND public.has_permission(v_user, 'services.update') IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_moderation AND (_reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 5 AND 1000) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
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
  IF _action = 'submit' THEN
    v_max_active := GREATEST(public.setting_int('marketplace_max_active_services', 50), 1);
    IF (
      SELECT count(*) FROM public.marketplace_services
      WHERE store_id = v_store.id AND status IN ('in_review', 'approved') AND id <> _id
    ) >= v_max_active THEN
      RAISE EXCEPTION 'MAX_ACTIVE_SERVICES_REACHED';
    END IF;
  END IF;
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

-- 5. Jendela pengajuan komplain mengikuti marketplace_complaint_window_hours.
CREATE OR REPLACE FUNCTION public.open_service_complaint(_order_id uuid, _reason text, _delivery_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_mso public.marketplace_service_orders%ROWTYPE;
  v_window bigint;
  v_delivered_at timestamptz;
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
  v_window := public.setting_int('marketplace_complaint_window_hours', 0);
  IF v_window > 0 AND v_mso.work_state = 'delivered' AND v_mso.latest_delivery_id IS NOT NULL THEN
    SELECT created_at INTO v_delivered_at FROM public.marketplace_service_deliveries
      WHERE id = v_mso.latest_delivery_id;
    IF v_delivered_at IS NOT NULL AND now() > v_delivered_at + make_interval(hours => v_window::int) THEN
      RAISE EXCEPTION 'COMPLAINT_WINDOW_EXPIRED';
    END IF;
  END IF;
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
END;
$$;

-- 6. Gate notifikasi in-app mengikuti notify_inapp_enabled dan toggle per-event.
CREATE OR REPLACE FUNCTION public.trg_notifications_setting_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.setting_bool('notify_inapp_enabled', true) THEN
    RETURN NULL;
  END IF;
  IF NEW.type = 'order.created' AND NOT public.setting_bool('notify_order_created', true) THEN
    RETURN NULL;
  ELSIF NEW.type = 'operator.assigned' AND NOT public.setting_bool('notify_operator_assigned', true) THEN
    RETURN NULL;
  ELSIF NEW.type = 'progress.updated' AND NOT public.setting_bool('notify_progress_updated', true) THEN
    RETURN NULL;
  ELSIF NEW.type = 'draft.ready' AND NOT public.setting_bool('notify_draft_ready', true) THEN
    RETURN NULL;
  ELSIF NEW.type = 'revision.done' AND NOT public.setting_bool('notify_revision_done', true) THEN
    RETURN NULL;
  ELSIF NEW.type = 'result.ready' AND NOT public.setting_bool('notify_result_ready', true) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_setting_gate ON public.notifications;
CREATE TRIGGER notifications_setting_gate
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notifications_setting_gate();
