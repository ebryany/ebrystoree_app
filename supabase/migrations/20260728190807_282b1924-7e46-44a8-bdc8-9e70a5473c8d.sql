-- ============ M2: metadata layanan & paket akademik ============
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS academic_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supported_education_levels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS supported_fields text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS supported_outputs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS supported_citation_styles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_quality_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allows_attachments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_rubric boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_dataset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_revision_limit integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS default_sla_hours integer NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS integrity_policy_version text NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS idx_services_academic_category ON public.services(academic_category_id);

ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS urgency_supported boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quality_review_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maximum_pages integer,
  ADD COLUMN IF NOT EXISTS included_outputs text[] NOT NULL DEFAULT '{}';

-- ============ M3/M4/M5: detail order akademik ============
ALTER TABLE public.service_order_details
  ADD COLUMN IF NOT EXISTS academic_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_name text,
  ADD COLUMN IF NOT EXISTS study_program text,
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS assignment_title text,
  ADD COLUMN IF NOT EXISTS assignment_description text,
  ADD COLUMN IF NOT EXISTS lecturer_instructions text,
  ADD COLUMN IF NOT EXISTS official_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_timezone text,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS output_type text,
  ADD COLUMN IF NOT EXISTS file_format text,
  ADD COLUMN IF NOT EXISTS citation_style text,
  ADD COLUMN IF NOT EXISTS estimated_pages integer,
  ADD COLUMN IF NOT EXISTS revision_limit_snapshot integer,
  ADD COLUMN IF NOT EXISTS institution_name text,
  ADD COLUMN IF NOT EXISTS software_required text,
  ADD COLUMN IF NOT EXISTS dataset_description text,
  ADD COLUMN IF NOT EXISTS presentation_duration integer,
  ADD COLUMN IF NOT EXISTS special_notes text,
  ADD COLUMN IF NOT EXISTS extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- M4
  ADD COLUMN IF NOT EXISTS integrity_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS integrity_policy_version text,
  ADD COLUMN IF NOT EXISTS no_credential_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope_review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scope_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_review_note text,
  ADD COLUMN IF NOT EXISTS scope_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS scope_reviewed_at timestamptz,
  -- M5
  ADD COLUMN IF NOT EXISTS package_price_snapshot bigint,
  ADD COLUMN IF NOT EXISTS addon_total_snapshot bigint,
  ADD COLUMN IF NOT EXISTS urgency_fee_snapshot bigint,
  ADD COLUMN IF NOT EXISTS reviewer_fee_snapshot bigint,
  ADD COLUMN IF NOT EXISTS discount_snapshot bigint,
  ADD COLUMN IF NOT EXISTS subtotal_snapshot bigint,
  ADD COLUMN IF NOT EXISTS total_snapshot bigint,
  ADD COLUMN IF NOT EXISTS urgency_level text,
  ADD COLUMN IF NOT EXISTS pricing_version text,
  ADD COLUMN IF NOT EXISTS pricing_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.service_order_details
  DROP CONSTRAINT IF EXISTS service_order_details_scope_status_check;
ALTER TABLE public.service_order_details
  ADD CONSTRAINT service_order_details_scope_status_check
  CHECK (scope_review_status = ANY (ARRAY['pending','approved','needs_clarification','rejected']));

CREATE INDEX IF NOT EXISTS idx_sod_scope_status ON public.service_order_details(scope_review_status);

-- ============ status order baru ============
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY[
  'draft','awaiting_payment','payment_under_review','paid','academic_review','waiting_assignment',
  'assigned','waiting_customer_data','queued','in_progress','waiting_customer_review','completed',
  'cancelled','refund_requested','refund_processing','refunded','disputed']));

-- ============ M3: lampiran privat ============
CREATE TABLE IF NOT EXISTS public.academic_order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  draft_key uuid,
  uploaded_by uuid NOT NULL,
  attachment_type text NOT NULL CHECK (attachment_type = ANY (ARRAY[
    'assignment_instruction','rubric','template','draft','dataset','reference',
    'lecturer_feedback','supporting_document'])),
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL CHECK (file_size > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (order_id IS NOT NULL OR draft_key IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE ON public.academic_order_attachments TO authenticated;
GRANT ALL ON public.academic_order_attachments TO service_role;

ALTER TABLE public.academic_order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachment_owner_select" ON public.academic_order_attachments
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_permission(auth.uid(), 'orders.view'));

CREATE POLICY "attachment_owner_insert" ON public.academic_order_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (order_id IS NULL OR public.is_order_owner(order_id, auth.uid()))
  );

CREATE POLICY "attachment_owner_soft_delete" ON public.academic_order_attachments
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_attachment_order ON public.academic_order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_attachment_draft ON public.academic_order_attachments(draft_key);

CREATE TRIGGER trg_attachment_updated_at BEFORE UPDATE ON public.academic_order_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ M5: konfigurasi harga ============
INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('pricing_version', '"academic-v1"', 'Versi formula harga akademik', false),
  ('urgency_threshold_hours', '24', 'Deadline < jam ini dianggap urgent', false),
  ('priority_threshold_hours', '72', 'Deadline < jam ini dianggap priority', false),
  ('urgency_fee_type', '"fixed"', 'fixed atau percent', false),
  ('urgency_fee_value', '50000', 'Biaya urgensi tingkat urgent', false),
  ('priority_fee_value', '20000', 'Biaya urgensi tingkat priority', false),
  ('reviewer_fee', '25000', 'Biaya quality reviewer akademik', false)
ON CONFLICT (key) DO NOTHING;

-- ============ RPC pembuatan order akademik ============
CREATE OR REPLACE FUNCTION public.create_academic_order(
  _service_id uuid,
  _package_id uuid,
  _addon_ids uuid[],
  _academic jsonb,
  _scope_flags text[],
  _reviewer_requested boolean,
  _integrity_accepted boolean,
  _no_credential_accepted boolean,
  _draft_key uuid,
  _idempotency_key text,
  _customer_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_s record; v_pkg record; v_addon record; v_cat record;
  v_existing uuid; v_order_id uuid; v_order_number text;
  v_addon_total bigint := 0; v_addons jsonb := '[]'::jsonb;
  v_pkg_price bigint; v_urgency bigint := 0; v_reviewer bigint := 0; v_discount bigint := 0;
  v_subtotal bigint; v_fee bigint; v_total bigint;
  v_deadline timestamptz; v_hours numeric; v_level text := 'normal';
  v_urg_thr bigint; v_pri_thr bigint; v_urg_type text; v_urg_val bigint; v_pri_val bigint; v_rev_fee bigint;
  v_pricing_version text; v_expiry timestamptz; v_scope text := 'pending';
  v_reviewer_needed boolean; v_tz text; v_risky boolean;
  v_allowed_flags text[] := ARRAY['active_exam','active_quiz','lms_impersonation','credential_request',
    'data_fabrication','plagiarism_request','grade_manipulation','illegal_access','identity_impersonation','other_risk'];
  v_flag text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.create') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF _integrity_accepted IS NOT TRUE OR _no_credential_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'INTEGRITY_REQUIRED';
  END IF;

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

  SELECT * INTO v_cat FROM public.categories WHERE id = v_s.academic_category_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATEGORY_INACTIVE'; END IF;

  SELECT * INTO v_pkg FROM public.service_packages
   WHERE id = _package_id AND service_id = _service_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_UNAVAILABLE'; END IF;

  -- validasi field akademik wajib
  IF COALESCE(btrim(_academic->>'course_name'),'') = ''
     OR COALESCE(btrim(_academic->>'study_program'),'') = ''
     OR COALESCE(btrim(_academic->>'education_level'),'') = ''
     OR COALESCE(btrim(_academic->>'assignment_title'),'') = ''
     OR length(COALESCE(btrim(_academic->>'assignment_description'),'')) < 20
     OR COALESCE(btrim(_academic->>'output_type'),'') = ''
     OR COALESCE(btrim(_academic->>'file_format'),'') = ''
     OR COALESCE(btrim(_academic->>'language'),'') = ''
  THEN RAISE EXCEPTION 'ACADEMIC_FIELDS_REQUIRED'; END IF;

  IF array_length(v_s.supported_education_levels, 1) IS NOT NULL
     AND NOT (_academic->>'education_level' = ANY (v_s.supported_education_levels))
  THEN RAISE EXCEPTION 'EDUCATION_LEVEL_UNSUPPORTED'; END IF;

  v_tz := NULLIF(btrim(_academic->>'customer_timezone'), '');
  IF v_tz IS NULL THEN RAISE EXCEPTION 'TIMEZONE_INVALID'; END IF;
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TIMEZONE_INVALID'; END;

  BEGIN
    v_deadline := (_academic->>'official_deadline_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'DEADLINE_INVALID'; END;
  IF v_deadline IS NULL OR v_deadline <= now() + interval '2 hours' THEN
    RAISE EXCEPTION 'DEADLINE_INVALID';
  END IF;

  -- scope flags
  FOREACH v_flag IN ARRAY COALESCE(_scope_flags, ARRAY[]::text[]) LOOP
    IF NOT (v_flag = ANY (v_allowed_flags)) THEN RAISE EXCEPTION 'SCOPE_FLAG_INVALID'; END IF;
  END LOOP;
  v_risky := COALESCE(array_length(_scope_flags, 1), 0) > 0;
  v_scope := CASE WHEN v_risky THEN 'needs_clarification' ELSE 'pending' END;

  -- pricing (server-side)
  SELECT (value #>> '{}') INTO v_pricing_version FROM public.system_settings WHERE key = 'pricing_version';
  v_pricing_version := COALESCE(v_pricing_version, 'academic-v1');
  v_urg_thr := public.setting_int('urgency_threshold_hours', 24);
  v_pri_thr := public.setting_int('priority_threshold_hours', 72);
  SELECT (value #>> '{}') INTO v_urg_type FROM public.system_settings WHERE key = 'urgency_fee_type';
  v_urg_type := COALESCE(v_urg_type, 'fixed');
  v_urg_val := public.setting_int('urgency_fee_value', 50000);
  v_pri_val := public.setting_int('priority_fee_value', 20000);
  v_rev_fee := public.setting_int('reviewer_fee', 25000);

  v_pkg_price := v_pkg.price;

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

  v_hours := EXTRACT(EPOCH FROM (v_deadline - now())) / 3600.0;
  IF v_pkg.urgency_supported THEN
    IF v_hours < v_urg_thr THEN v_level := 'urgent';
    ELSIF v_hours < v_pri_thr THEN v_level := 'priority';
    END IF;
  END IF;

  IF v_level = 'urgent' THEN
    v_urgency := CASE WHEN v_urg_type = 'percent'
                      THEN ((v_pkg_price + v_addon_total) * v_urg_val) / 100
                      ELSE v_urg_val END;
  ELSIF v_level = 'priority' THEN
    v_urgency := CASE WHEN v_urg_type = 'percent'
                      THEN ((v_pkg_price + v_addon_total) * v_pri_val) / 100
                      ELSE v_pri_val END;
  END IF;

  v_reviewer_needed := v_s.requires_quality_review
                       OR COALESCE(_reviewer_requested, false)
                       OR v_pkg.priority IN ('high','urgent');
  IF v_reviewer_needed AND NOT v_pkg.quality_review_included THEN
    v_reviewer := v_rev_fee;
  END IF;

  v_subtotal := v_pkg_price + v_addon_total + v_urgency + v_reviewer - v_discount;
  IF v_subtotal < 0 THEN v_subtotal := 0; END IF;
  v_fee := public.setting_int('admin_fee', 0);
  v_total := v_subtotal + v_fee;
  v_expiry := now() + (public.setting_int('order_expiry_hours', 24) || ' hours')::interval;

  -- transaksi
  INSERT INTO public.orders (user_id, order_type, status, subtotal, admin_fee, total, customer_note, expired_at)
  VALUES (v_user, 'service', 'awaiting_payment', v_subtotal, v_fee, v_total, NULLIF(_customer_note,''), v_expiry)
  RETURNING id, order_number INTO v_order_id, v_order_number;

  INSERT INTO public.order_items (order_id, item_type, service_id, package_id, name_snapshot, sku_snapshot, unit_price, quantity, total, metadata)
  VALUES (v_order_id, 'service', v_s.id, v_pkg.id, v_s.name || ' — ' || v_pkg.name, v_s.slug, v_pkg_price, 1, v_pkg_price,
          jsonb_build_object('estimated_days', v_pkg.estimated_days, 'free_revisions', v_pkg.free_revisions,
                             'sla_hours', v_pkg.sla_hours, 'academic_category', v_cat.slug));

  FOR v_addon IN
    SELECT * FROM public.service_addons
     WHERE service_id = _service_id AND is_active = true AND id = ANY(COALESCE(_addon_ids, ARRAY[]::uuid[]))
  LOOP
    INSERT INTO public.order_items (order_id, item_type, service_id, addon_id, name_snapshot, unit_price, quantity, total)
    VALUES (v_order_id, 'addon', v_s.id, v_addon.id, v_addon.name, v_addon.price, 1, v_addon.price);
  END LOOP;

  INSERT INTO public.service_order_details (
    order_id, package_snapshot, addons_snapshot, requirements, requirements_note,
    estimated_days, revision_allowance, requirements_complete,
    academic_category_id, course_name, study_program, education_level, assignment_title,
    assignment_description, lecturer_instructions, official_deadline_at, customer_timezone,
    language, output_type, file_format, citation_style, estimated_pages, revision_limit_snapshot,
    institution_name, software_required, dataset_description, presentation_duration, special_notes,
    extra_fields, integrity_accepted_at, integrity_policy_version, no_credential_accepted_at,
    scope_review_status, scope_flags,
    package_price_snapshot, addon_total_snapshot, urgency_fee_snapshot, reviewer_fee_snapshot,
    discount_snapshot, subtotal_snapshot, total_snapshot, urgency_level, pricing_version, pricing_breakdown,
    customer_deadline
  ) VALUES (
    v_order_id,
    jsonb_build_object('id', v_pkg.id, 'name', v_pkg.name, 'price', v_pkg_price,
                       'estimated_days', v_pkg.estimated_days, 'free_revisions', v_pkg.free_revisions,
                       'sla_hours', v_pkg.sla_hours, 'service_name', v_s.name, 'service_slug', v_s.slug),
    v_addons,
    COALESCE(_academic->'extra_fields', '{}'::jsonb),
    NULLIF(btrim(_academic->>'assignment_description'), ''),
    COALESCE(v_pkg.estimated_days, 1),
    COALESCE(v_pkg.free_revisions, v_s.default_revision_limit),
    true,
    v_cat.id,
    btrim(_academic->>'course_name'),
    btrim(_academic->>'study_program'),
    btrim(_academic->>'education_level'),
    btrim(_academic->>'assignment_title'),
    btrim(_academic->>'assignment_description'),
    NULLIF(btrim(_academic->>'lecturer_instructions'), ''),
    v_deadline,
    v_tz,
    btrim(_academic->>'language'),
    btrim(_academic->>'output_type'),
    btrim(_academic->>'file_format'),
    NULLIF(btrim(_academic->>'citation_style'), ''),
    NULLIF(_academic->>'estimated_pages', '')::int,
    COALESCE(v_pkg.free_revisions, v_s.default_revision_limit),
    NULLIF(btrim(_academic->>'institution_name'), ''),
    NULLIF(btrim(_academic->>'software_required'), ''),
    NULLIF(btrim(_academic->>'dataset_description'), ''),
    NULLIF(_academic->>'presentation_duration', '')::int,
    NULLIF(btrim(_academic->>'special_notes'), ''),
    COALESCE(_academic->'extra_fields', '{}'::jsonb),
    now(), v_s.integrity_policy_version, now(),
    v_scope, COALESCE(_scope_flags, ARRAY[]::text[]),
    v_pkg_price, v_addon_total, v_urgency, v_reviewer, v_discount, v_subtotal, v_total,
    v_level, v_pricing_version,
    jsonb_build_object('package_price', v_pkg_price, 'addon_total', v_addon_total,
                       'urgency_level', v_level, 'urgency_fee', v_urgency,
                       'reviewer_fee', v_reviewer, 'discount', v_discount,
                       'subtotal', v_subtotal, 'admin_fee', v_fee, 'total', v_total,
                       'pricing_version', v_pricing_version),
    v_deadline
  );

  -- lampiran draft milik user
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
  VALUES (v_order_id, NULL, 'awaiting_payment', v_user, 'customer', 'Pesanan akademik dibuat, menunggu pembayaran.');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'academic.order_created', 'Pesanan akademik dibuat',
          'Pesanan ' || v_order_number || ' menunggu pembayaran.', 'order', v_order_id);

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after_json)
  VALUES (v_user, 'customer', 'academic_order.create', 'order', v_order_id,
          jsonb_build_object('total', v_total, 'service_id', v_s.id, 'package_id', v_pkg.id,
                             'urgency_level', v_level, 'scope_flags', COALESCE(_scope_flags, ARRAY[]::text[])));

  RETURN jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number,
                            'duplicate', false, 'total', v_total, 'urgency_level', v_level);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_academic_order(uuid,uuid,uuid[],jsonb,text[],boolean,boolean,boolean,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_academic_order(uuid,uuid,uuid[],jsonb,text[],boolean,boolean,boolean,uuid,text,text) TO authenticated;

-- fungsi lama tidak boleh dipanggil aplikasi lagi
REVOKE ALL ON FUNCTION public.create_service_order(uuid,uuid,uuid[],jsonb,text,text,text) FROM PUBLIC, anon, authenticated;

-- ============ quote harga (read-only) ============
CREATE OR REPLACE FUNCTION public.quote_academic_order(
  _service_id uuid, _package_id uuid, _addon_ids uuid[],
  _deadline timestamptz, _reviewer_requested boolean
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s record; v_pkg record; v_addon_total bigint := 0;
  v_urgency bigint := 0; v_reviewer bigint := 0; v_level text := 'normal';
  v_hours numeric; v_urg_thr bigint; v_pri_thr bigint; v_urg_type text;
  v_urg_val bigint; v_pri_val bigint; v_rev_fee bigint; v_fee bigint; v_subtotal bigint;
BEGIN
  SELECT * INTO v_s FROM public.services WHERE id = _service_id AND status = 'published' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_UNAVAILABLE'; END IF;
  SELECT * INTO v_pkg FROM public.service_packages WHERE id = _package_id AND service_id = _service_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_UNAVAILABLE'; END IF;

  SELECT COALESCE(SUM(price), 0) INTO v_addon_total FROM public.service_addons
   WHERE service_id = _service_id AND is_active = true AND id = ANY(COALESCE(_addon_ids, ARRAY[]::uuid[]));

  v_urg_thr := public.setting_int('urgency_threshold_hours', 24);
  v_pri_thr := public.setting_int('priority_threshold_hours', 72);
  SELECT (value #>> '{}') INTO v_urg_type FROM public.system_settings WHERE key = 'urgency_fee_type';
  v_urg_type := COALESCE(v_urg_type, 'fixed');
  v_urg_val := public.setting_int('urgency_fee_value', 50000);
  v_pri_val := public.setting_int('priority_fee_value', 20000);
  v_rev_fee := public.setting_int('reviewer_fee', 25000);
  v_fee := public.setting_int('admin_fee', 0);

  IF _deadline IS NOT NULL AND v_pkg.urgency_supported THEN
    v_hours := EXTRACT(EPOCH FROM (_deadline - now())) / 3600.0;
    IF v_hours < v_urg_thr THEN v_level := 'urgent';
    ELSIF v_hours < v_pri_thr THEN v_level := 'priority'; END IF;
  END IF;

  IF v_level = 'urgent' THEN
    v_urgency := CASE WHEN v_urg_type = 'percent' THEN ((v_pkg.price + v_addon_total) * v_urg_val)/100 ELSE v_urg_val END;
  ELSIF v_level = 'priority' THEN
    v_urgency := CASE WHEN v_urg_type = 'percent' THEN ((v_pkg.price + v_addon_total) * v_pri_val)/100 ELSE v_pri_val END;
  END IF;

  IF (v_s.requires_quality_review OR COALESCE(_reviewer_requested,false) OR v_pkg.priority IN ('high','urgent'))
     AND NOT v_pkg.quality_review_included THEN
    v_reviewer := v_rev_fee;
  END IF;

  v_subtotal := v_pkg.price + v_addon_total + v_urgency + v_reviewer;

  RETURN jsonb_build_object('package_price', v_pkg.price, 'addon_total', v_addon_total,
    'urgency_level', v_level, 'urgency_fee', v_urgency, 'reviewer_fee', v_reviewer,
    'discount', 0, 'subtotal', v_subtotal, 'admin_fee', v_fee, 'total', v_subtotal + v_fee);
END;
$function$;

REVOKE ALL ON FUNCTION public.quote_academic_order(uuid,uuid,uuid[],timestamptz,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_academic_order(uuid,uuid,uuid[],timestamptz,boolean) TO authenticated;

-- ============ payment verified → academic_review untuk order akademik ============
CREATE OR REPLACE FUNCTION public.verify_manual_payment(_payment_id uuid, _decision text, _reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_pay record; v_order record; v_proof uuid;
  v_new_pay text; v_new_order text; v_role text; v_is_academic boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision NOT IN ('approved','rejected','reupload_requested') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _decision = 'approved' THEN
    IF NOT public.has_permission(v_user,'payments.verify') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    IF NOT public.has_permission(v_user,'payments.reject') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_pay.status <> 'waiting_verification' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_pay.order_id FOR UPDATE;
  SELECT id INTO v_proof FROM public.manual_payment_proofs
    WHERE payment_id = _payment_id AND status = 'submitted' ORDER BY submitted_at DESC LIMIT 1;
  SELECT string_agg(role::text, ',') INTO v_role FROM public.user_roles WHERE user_id = v_user;

  SELECT EXISTS (SELECT 1 FROM public.service_order_details
                  WHERE order_id = v_order.id AND academic_category_id IS NOT NULL)
    INTO v_is_academic;

  IF _decision = 'approved' THEN
    v_new_pay := 'paid';
    UPDATE public.payments SET status = 'paid', paid_amount = expected_amount, paid_at = now() WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'approved' WHERE id = v_proof;
    UPDATE public.invoices SET status = 'paid', paid_at = now() WHERE order_id = v_order.id;

    INSERT INTO public.digital_entitlements (user_id, order_item_id, order_id, product_id, file_version, download_limit, valid_until)
    SELECT v_order.user_id, oi.id, v_order.id, oi.product_id, dp.version,
           COALESCE(dp.download_limit, 5), now() + (COALESCE(dp.validity_days, 365) || ' days')::interval
    FROM public.order_items oi JOIN public.digital_products dp ON dp.id = oi.product_id
    WHERE oi.order_id = v_order.id AND oi.item_type = 'digital_product'
    ON CONFLICT (order_item_id) DO NOTHING;

    IF v_order.order_type = 'digital_product' THEN
      v_new_order := 'completed';
      UPDATE public.orders SET status = 'completed', paid_at = now(), completed_at = now() WHERE id = v_order.id;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.completed', 'Produk siap diunduh',
              'Pembayaran order ' || v_order.order_number || ' terverifikasi. Produk tersedia di pustaka Anda.', 'order', v_order.id);
    ELSIF v_is_academic THEN
      v_new_order := 'academic_review';
      UPDATE public.orders SET status = 'academic_review', paid_at = now() WHERE id = v_order.id;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('academic_scope_review', 'order', v_order.id, 'Periksa kebutuhan akademik ' || v_order.order_number,
              'Pesanan akademik sudah lunas dan menunggu pemeriksaan kebutuhan sebelum penugasan.', 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'academic.payment_verified', 'Pembayaran telah diverifikasi',
              'Kebutuhan tugas pada pesanan ' || v_order.order_number || ' sedang diperiksa oleh tim.', 'order', v_order.id);
    ELSE
      v_new_order := 'waiting_assignment';
      UPDATE public.orders SET status = 'waiting_assignment', paid_at = now() WHERE id = v_order.id;
      INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
      VALUES ('assign_operator', 'order', v_order.id, 'Tugaskan operator untuk ' || v_order.order_number,
              'Order jasa sudah lunas dan menunggu penugasan operator.', 'high')
      ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (v_order.user_id, 'order.paid', 'Pembayaran terverifikasi',
              'Order ' || v_order.order_number || ' menunggu penugasan operator.', 'order', v_order.id);
    END IF;
  ELSIF _decision = 'rejected' THEN
    v_new_pay := 'rejected'; v_new_order := 'awaiting_payment';
    UPDATE public.payments SET status = 'rejected' WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'rejected' WHERE id = v_proof;
    UPDATE public.orders SET status = 'awaiting_payment' WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'payment.rejected', 'Bukti pembayaran ditolak',
            'Bukti pembayaran order ' || v_order.order_number || ' ditolak: ' || _reason, 'order', v_order.id);
  ELSE
    v_new_pay := 'waiting_payment'; v_new_order := 'awaiting_payment';
    UPDATE public.payments SET status = 'waiting_payment' WHERE id = _payment_id;
    UPDATE public.manual_payment_proofs SET status = 'rejected' WHERE id = v_proof;
    UPDATE public.orders SET status = 'awaiting_payment' WHERE id = v_order.id;
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (v_order.user_id, 'payment.reupload_requested', 'Unggah ulang bukti pembayaran',
            'Mohon unggah ulang bukti pembayaran order ' || v_order.order_number || ': ' || _reason, 'order', v_order.id);
  END IF;

  INSERT INTO public.payment_verifications (payment_id, proof_id, verifier_id, previous_status, new_status, decision, reason)
  VALUES (_payment_id, v_proof, v_user, v_pay.status, v_new_pay, _decision, _reason);

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
  VALUES (v_order.id, v_order.status, v_new_order, v_user, 'finance',
          CASE WHEN _decision = 'approved' THEN 'Pembayaran telah diverifikasi.' ELSE 'Pembayaran belum dapat diterima.' END, _reason);

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _reason
    WHERE task_type = 'verify_payment' AND source_type = 'payment' AND source_id = _payment_id
      AND status IN ('open','in_progress','blocked');

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_user, v_role, 'payment.' || _decision, 'payment', _payment_id,
          jsonb_build_object('status', v_pay.status), jsonb_build_object('status', v_new_pay), _reason);

  RETURN jsonb_build_object('payment_status', v_new_pay, 'order_status', v_new_order);
END;
$function$;

-- assign_operator kini juga menerima order dari academic_review
CREATE OR REPLACE FUNCTION public.assign_operator(_order_id uuid, _operator_id uuid, _deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, _note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_order public.orders; v_assign uuid; v_days integer; v_scope text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.assign') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.order_type <> 'service' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status NOT IN ('waiting_assignment','academic_review') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  SELECT scope_review_status INTO v_scope FROM public.service_order_details WHERE order_id = _order_id;
  IF v_order.status = 'academic_review' AND COALESCE(v_scope,'pending') <> 'approved' THEN
    RAISE EXCEPTION 'SCOPE_REVIEW_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _operator_id
                 AND role IN ('operator','admin','super_admin')) THEN
    RAISE EXCEPTION 'OPERATOR_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.operator_assignments
             WHERE order_id = _order_id AND status IN ('assigned','accepted','in_progress')) THEN
    RAISE EXCEPTION 'ALREADY_ASSIGNED';
  END IF;

  SELECT COALESCE(estimated_days, 1) INTO v_days FROM public.service_order_details WHERE order_id = _order_id;

  INSERT INTO public.operator_assignments (order_id, operator_id, assigned_by, status, deadline_at, internal_note)
  VALUES (_order_id, _operator_id, v_user, 'assigned',
          COALESCE(_deadline, now() + (COALESCE(v_days,1) || ' days')::interval), NULLIF(_note,''))
  RETURNING id INTO v_assign;

  UPDATE public.orders SET status = 'assigned' WHERE id = _order_id;
  UPDATE public.service_order_details
     SET internal_deadline = COALESCE(_deadline, now() + (COALESCE(v_days,1) || ' days')::interval)
   WHERE order_id = _order_id;

  INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note, internal_note)
  VALUES (_order_id, v_order.status, 'assigned', v_user, 'admin', 'Pesanan ditugaskan ke pendamping akademik.', _note);

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = COALESCE(_note, note)
   WHERE task_type IN ('assign_operator','academic_scope_review') AND source_type = 'order' AND source_id = _order_id
     AND status IN ('open','in_progress','blocked');

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id) VALUES
    (_operator_id, 'assignment.created', 'Tugas baru',
     'Anda ditugaskan mengerjakan order ' || v_order.order_number || '.', 'order', _order_id),
    (v_order.user_id, 'order.assigned', 'Pendamping ditugaskan',
     'Pesanan ' || v_order.order_number || ' sudah ditugaskan ke pendamping akademik.', 'order', _order_id);

  PERFORM public.write_audit_log('order.assign', 'order', _order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status','assigned','operator_id',_operator_id), _note, NULL, NULL);

  RETURN jsonb_build_object('assignment_id', v_assign, 'order_status', 'assigned');
END;
$function$;

-- ============ review scope akademik (AS-2: penyimpanan keputusan) ============
CREATE OR REPLACE FUNCTION public.review_academic_scope(_order_id uuid, _decision text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_order public.orders;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'orders.update') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _decision NOT IN ('approved','needs_clarification','rejected') THEN RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF _decision <> 'approved' AND COALESCE(length(btrim(_note)),0) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.service_order_details
     SET scope_review_status = _decision, scope_review_note = _note,
         scope_reviewed_by = v_user, scope_reviewed_at = now()
   WHERE order_id = _order_id;

  IF _decision = 'approved' AND v_order.status = 'academic_review' THEN
    UPDATE public.orders SET status = 'waiting_assignment' WHERE id = _order_id;
    INSERT INTO public.order_status_histories (order_id, previous_status, new_status, actor_id, actor_type, public_note)
    VALUES (_order_id, v_order.status, 'waiting_assignment', v_user, 'admin',
            'Kebutuhan tugas telah diperiksa. Menunggu penugasan pendamping.');
  END IF;

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_order.user_id, 'academic.scope_reviewed', 'Hasil pemeriksaan kebutuhan',
          'Pemeriksaan kebutuhan pesanan ' || v_order.order_number || ': ' || _decision, 'order', _order_id);

  PERFORM public.write_audit_log('academic.scope_review', 'order', _order_id, NULL,
    jsonb_build_object('scope_review_status', _decision), _note, NULL, NULL);

  RETURN jsonb_build_object('scope_review_status', _decision);
END;
$function$;

REVOKE ALL ON FUNCTION public.review_academic_scope(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_academic_scope(uuid,text,text) TO authenticated;