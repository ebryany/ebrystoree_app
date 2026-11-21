-- Alur checkout jasa umum (website, desain, IT, konten, dll.) terpisah dari alur akademik.
-- Memakai ulang orders/order_items/service_order_details/invoices/payments yang sama.
-- service_order_details.academic_category_id dibiarkan NULL sehingga verify_manual_payment /
-- settle_gateway_payment merutekan pesanan ke waiting_assignment (antrean /admin/pengerjaan).

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS service_flow text NOT NULL DEFAULT 'general';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_service_flow_check') THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_service_flow_check CHECK (service_flow IN ('academic', 'general'));
  END IF;
END $$;

UPDATE public.categories SET service_flow = 'academic'
 WHERE kind = 'service' AND slug IN (
   'analisis-data','presentasi','pemrograman-akademik','proposal','pendampingan-skripsi','makalah',
   'review-tulisan','formatting','sitasi-dan-referensi','laporan-praktikum','revisi-dosen',
   'persiapan-sidang','tugas-harian');

-- Layanan jasa umum tidak boleh menunjuk kategori akademik.
UPDATE public.services s SET academic_category_id = NULL
  FROM public.categories c
 WHERE c.id = s.academic_category_id AND c.service_flow = 'general';

CREATE OR REPLACE FUNCTION public.create_general_service_order(
  _service_id uuid,
  _package_id uuid,
  _addon_ids uuid[],
  _brief jsonb,
  _no_credential_accepted boolean,
  _draft_key uuid,
  _idempotency_key text,
  _customer_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_s record; v_pkg record; v_addon record; v_flow text;
  v_existing uuid; v_order_id uuid; v_order_number text; v_expiry timestamptz;
  v_addon_total bigint := 0; v_addons jsonb := '[]'::jsonb;
  v_subtotal bigint; v_fee bigint; v_total bigint;
  v_title text; v_desc text; v_deliverables text; v_refs text; v_deadline timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.create') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF _no_credential_accepted IS NOT TRUE THEN RAISE EXCEPTION 'CREDENTIAL_ACK_REQUIRED'; END IF;

  SELECT o.id INTO v_existing FROM public.payments p
    JOIN public.orders o ON o.id = p.order_id
   WHERE p.idempotency_key = _idempotency_key AND o.user_id = v_user;
  IF v_existing IS NOT NULL THEN
    SELECT order_number INTO v_order_number FROM public.orders WHERE id = v_existing;
    RETURN jsonb_build_object('order_id', v_existing, 'order_number', v_order_number, 'duplicate', true);
  END IF;

  SELECT * INTO v_s FROM public.services
   WHERE id = _service_id AND status = 'published' AND deleted_at IS NULL AND is_test_data = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;

  SELECT c.service_flow INTO v_flow FROM public.categories c
   WHERE c.id = COALESCE(v_s.category_id, v_s.academic_category_id);
  IF COALESCE(v_flow, 'general') <> 'general' THEN RAISE EXCEPTION 'WRONG_SERVICE_FLOW'; END IF;

  SELECT * INTO v_pkg FROM public.service_packages
   WHERE id = _package_id AND service_id = _service_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_UNAVAILABLE'; END IF;

  v_title := btrim(COALESCE(_brief->>'title', ''));
  v_desc := btrim(COALESCE(_brief->>'description', ''));
  v_deliverables := NULLIF(btrim(COALESCE(_brief->>'deliverables', '')), '');
  v_refs := NULLIF(btrim(COALESCE(_brief->>'references', '')), '');
  IF length(v_title) < 3 OR length(v_title) > 200 OR length(v_desc) < 20 OR length(v_desc) > 4000
     OR length(COALESCE(v_deliverables, '')) > 2000 OR length(COALESCE(v_refs, '')) > 2000
  THEN RAISE EXCEPTION 'BRIEF_REQUIRED'; END IF;

  IF NULLIF(_brief->>'deadline_at', '') IS NOT NULL THEN
    BEGIN
      v_deadline := (_brief->>'deadline_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'DEADLINE_INVALID'; END;
    IF v_deadline <= now() + interval '2 hours' THEN RAISE EXCEPTION 'DEADLINE_INVALID'; END IF;
  END IF;

  FOR v_addon IN
    SELECT * FROM public.service_addons
     WHERE service_id = _service_id AND is_active = true
       AND id = ANY(COALESCE(_addon_ids, ARRAY[]::uuid[]))
     ORDER BY sort_order
  LOOP
    v_addon_total := v_addon_total + v_addon.price;
    v_addons := v_addons || jsonb_build_object('id', v_addon.id, 'name', v_addon.name, 'price', v_addon.price);
  END LOOP;
  IF COALESCE(array_length(_addon_ids, 1), 0) <> jsonb_array_length(v_addons) THEN
    RAISE EXCEPTION 'ADDON_INVALID';
  END IF;

  v_subtotal := v_pkg.price + v_addon_total;
  v_fee := public.setting_int('admin_fee', 0);
  v_total := v_subtotal + v_fee;
  v_expiry := now() + (public.setting_int('order_expiry_hours', 24) || ' hours')::interval;

  INSERT INTO public.orders (user_id, order_type, status, subtotal, admin_fee, total, customer_note, expired_at)
  VALUES (v_user, 'service', 'awaiting_payment', v_subtotal, v_fee, v_total, NULLIF(btrim(_customer_note), ''), v_expiry)
  RETURNING id, order_number INTO v_order_id, v_order_number;

  INSERT INTO public.order_items (order_id, item_type, service_id, package_id, name_snapshot, sku_snapshot, unit_price, quantity, total, metadata)
  VALUES (v_order_id, 'service', v_s.id, v_pkg.id, v_s.name || ' — ' || v_pkg.name, v_s.slug, v_pkg.price, 1, v_pkg.price,
          jsonb_build_object('estimated_days', v_pkg.estimated_days, 'free_revisions', v_pkg.free_revisions,
                             'sla_hours', v_pkg.sla_hours, 'service_flow', 'general'));

  FOR v_addon IN
    SELECT * FROM public.service_addons
     WHERE service_id = _service_id AND is_active = true AND id = ANY(COALESCE(_addon_ids, ARRAY[]::uuid[]))
  LOOP
    INSERT INTO public.order_items (order_id, item_type, service_id, addon_id, name_snapshot, unit_price, quantity, total)
    VALUES (v_order_id, 'addon', v_s.id, v_addon.id, v_addon.name, v_addon.price, 1, v_addon.price);
  END LOOP;

  INSERT INTO public.service_order_details (
    order_id, package_snapshot, addons_snapshot, requirements, requirements_note,
    estimated_days, revision_allowance, requirements_complete, customer_deadline,
    assignment_title, assignment_description, revision_limit_snapshot, extra_fields,
    no_credential_accepted_at, scope_review_status,
    package_price_snapshot, addon_total_snapshot, subtotal_snapshot, total_snapshot, pricing_breakdown
  ) VALUES (
    v_order_id,
    jsonb_build_object('id', v_pkg.id, 'name', v_pkg.name, 'price', v_pkg.price,
                       'estimated_days', v_pkg.estimated_days, 'free_revisions', v_pkg.free_revisions,
                       'sla_hours', v_pkg.sla_hours, 'service_name', v_s.name, 'service_slug', v_s.slug),
    v_addons,
    jsonb_build_object('flow', 'general', 'title', v_title, 'description', v_desc,
                       'deliverables', v_deliverables, 'references', v_refs),
    concat_ws(E'\n\n', v_title, v_desc,
              CASE WHEN v_deliverables IS NOT NULL THEN 'Hasil yang diharapkan: ' || v_deliverables END,
              CASE WHEN v_refs IS NOT NULL THEN 'Referensi: ' || v_refs END),
    COALESCE(v_pkg.estimated_days, 1),
    COALESCE(v_pkg.free_revisions, v_s.default_revision_limit, 0),
    true,
    v_deadline,
    v_title, v_desc,
    COALESCE(v_pkg.free_revisions, v_s.default_revision_limit, 0),
    '{}'::jsonb,
    now(), 'approved',
    v_pkg.price, v_addon_total, v_subtotal, v_total,
    jsonb_build_object('package_price', v_pkg.price, 'addon_total', v_addon_total,
                       'subtotal', v_subtotal, 'admin_fee', v_fee, 'total', v_total, 'flow', 'general')
  );

  IF _draft_key IS NOT NULL THEN
    UPDATE public.academic_order_attachments
       SET order_id = v_order_id, draft_key = NULL
     WHERE draft_key = _draft_key AND uploaded_by = v_user AND order_id IS NULL AND deleted_at IS NULL;
  END IF;

  INSERT INTO public.invoices (order_id, customer_snapshot, currency, subtotal, admin_fee, total, status, due_at)
  SELECT v_order_id, jsonb_build_object('name', pr.full_name, 'email', pr.email), 'IDR', v_subtotal, v_fee, v_total, 'issued', v_expiry
  FROM public.profiles pr WHERE pr.id = v_user;

  INSERT INTO public.payments (order_id, user_id, provider, method, status, expected_amount, idempotency_key, expired_at)
  VALUES (v_order_id, v_user, 'manual', 'dana', 'waiting_payment', v_total, _idempotency_key, v_expiry);

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
  VALUES (v_order_id, NULL, 'awaiting_payment', v_user, 'customer', 'Pesanan jasa dibuat, menunggu pembayaran.');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'order.created', 'Pesanan jasa dibuat',
          'Pesanan ' || v_order_number || ' menunggu pembayaran.', 'order', v_order_id);

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json)
  VALUES (v_user, 'customer', 'service_order.create', 'order', v_order_id,
          jsonb_build_object('total', v_total, 'service_id', v_s.id, 'package_id', v_pkg.id, 'flow', 'general'));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                            'duplicate', false, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_general_service_order(uuid,uuid,uuid[],jsonb,boolean,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_general_service_order(uuid,uuid,uuid[],jsonb,boolean,uuid,text,text) TO authenticated;
