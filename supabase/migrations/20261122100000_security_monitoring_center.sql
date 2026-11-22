-- ============================================================================
-- EBRYSTORE SECURITY MONITORING CENTER, ACCESS GOVERNANCE & PRIVILEGE HARDENING
--
-- 1. Hardening trigger & RLS untuk mencegah privilege escalation via PostgREST/MCP:
--    - Non-super_admin (termasuk role `admin` dengan `roles.manage`) DILARANG
--      memberikan atau mencabut role `super_admin`.
--    - `permissions` & `role_permissions` DILARANG dimodifikasi oleh role `admin`
--      biasa; wajib `permissions.manage` dan dilarang self-role escalation.
-- 2. Penambahan 6 permission granular grup `Keamanan`:
--    - security.events.read
--    - security.events.view_details
--    - security.alerts.read
--    - security.alerts.manage
--    - security.events.resolve
--    - security.settings.manage
-- 3. Pembuatan tabel monitoring keamanan terstruktur:
--    - public.security_events
--    - public.security_event_histories
--    - public.security_alerts
--    - RPC public.record_security_event(...) dengan deduplikasi & alert correlation
--    - RPC public.cleanup_old_security_events(...) untuk retensi log
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PRIVILEGE ESCALATION HARDENING (user_roles, permissions, role_permissions)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  super_count int;
  v_role public.app_role;
BEGIN
  v_role := CASE WHEN TG_OP = 'DELETE' THEN OLD.role ELSE NEW.role END;

  -- Hanya super_admin (atau service_role / auth.uid() IS NULL) yang boleh
  -- menyentuh role super_admin, termasuk via Supabase Data API / MCP.
  IF v_role = 'super_admin' AND auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Hanya super admin yang dapat mengubah peran super_admin';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.role = 'super_admin' THEN
    SELECT count(*) INTO super_count FROM public.user_roles WHERE role = 'super_admin';
    IF super_count <= 1 THEN
      RAISE EXCEPTION 'Super admin terakhir tidak dapat dihapus';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Tidak dapat memberi peran untuk akun sendiri';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Cabut write policy permisif `is_admin()` pada permissions & role_permissions
-- dan ganti dengan batas `is_super_admin()` / `has_permission('permissions.manage')`.
DROP POLICY IF EXISTS permissions_write_admin ON public.permissions;
CREATE POLICY permissions_write_super_admin ON public.permissions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS role_permissions_write_admin ON public.role_permissions;
CREATE POLICY role_permissions_write_manage ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'permissions.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'permissions.manage'));

CREATE OR REPLACE FUNCTION public.protect_role_permissions_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF NOT public.has_permission(auth.uid(), 'permissions.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_role := CASE WHEN TG_OP = 'DELETE' THEN OLD.role ELSE NEW.role END;

  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'Izin super admin dikunci oleh sistem';
  END IF;

  IF NOT public.is_super_admin(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = v_role
  ) THEN
    RAISE EXCEPTION 'Tidak dapat mengubah izin peran milik sendiri';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS role_permissions_protect ON public.role_permissions;
CREATE TRIGGER role_permissions_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.protect_role_permissions_changes();

-- ----------------------------------------------------------------------------
-- 2. REGISTRASI PERMISSION KEAMANAN GRANULAR
-- ----------------------------------------------------------------------------

INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('security.events.read',         'Keamanan', 'Melihat pusat pemantauan keamanan dan daftar security event', false),
  ('security.events.view_details', 'Keamanan', 'Melihat detail teknis security event dan metadata tersanitasi', false),
  ('security.alerts.read',         'Keamanan', 'Melihat daftar peringatan keamanan (security alerts)', false),
  ('security.alerts.manage',       'Keamanan', 'Mengelola dan menindaklanjuti peringatan keamanan', false),
  ('security.events.resolve',      'Keamanan', 'Mengubah status investigasi dan resolusi security event', false),
  ('security.settings.manage',     'Keamanan', 'Mengelola aturan deteksi dan konfigurasi keamanan', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'super_admin'::public.app_role, key FROM unnest(ARRAY[
  'security.events.read',
  'security.events.view_details',
  'security.alerts.read',
  'security.alerts.manage',
  'security.events.resolve',
  'security.settings.manage'
]) AS key
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM unnest(ARRAY[
  'security.events.read',
  'security.events.view_details',
  'security.alerts.read',
  'security.events.resolve'
]) AS key
ON CONFLICT (role, permission_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. TABEL SECURITY EVENTS, HISTORIES & ALERTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  category text NOT NULL CHECK (category IN ('access_denial', 'suspicious_activity', 'security_violation')),
  actor_user_id uuid NULL,
  actor_role text NULL,
  actor_email_masked text NULL,
  ip_address text NULL,
  user_agent text NULL,
  http_method text NOT NULL DEFAULT 'POST',
  endpoint text NOT NULL,
  route_template text NULL,
  action_name text NULL,
  target_resource_type text NULL,
  target_resource_id text NULL,
  status_code integer NOT NULL DEFAULT 403,
  reason_code text NOT NULL,
  request_id text NOT NULL,
  source_system text NOT NULL DEFAULT 'app_server',
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  dedup_key text NULL,
  sanitized_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  detection_status text NOT NULL DEFAULT 'NEW'
    CHECK (detection_status IN ('NEW', 'INVESTIGATING', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE')),
  assigned_to uuid NULL,
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  resolution_note text NULL
);

CREATE INDEX IF NOT EXISTS idx_security_events_created_at
  ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created
  ON public.security_events (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_status_created
  ON public.security_events (detection_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created
  ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_created
  ON public.security_events (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_actor_created
  ON public.security_events (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_dedup_last_seen
  ON public.security_events (dedup_key, last_seen_at DESC)
  WHERE dedup_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.security_event_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.security_events(id) ON DELETE CASCADE,
  actor_id uuid NULL,
  actor_role text NULL,
  previous_status text NULL,
  new_status text NOT NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_event_histories_event
  ON public.security_event_histories (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz NOT NULL DEFAULT now(),
  rule_code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'INVESTIGATING', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE')),
  source_ip text NULL,
  actor_user_id uuid NULL,
  target_endpoint text NULL,
  trigger_count integer NOT NULL DEFAULT 1 CHECK (trigger_count >= 1),
  sample_event_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedup_key text NULL,
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  resolution_note text NULL
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_status_created
  ON public.security_alerts (status, last_triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_dedup
  ON public.security_alerts (dedup_key, last_triggered_at DESC)
  WHERE dedup_key IS NOT NULL;

DROP TRIGGER IF EXISTS security_alerts_updated_at ON public.security_alerts;
CREATE TRIGGER security_alerts_updated_at
  BEFORE UPDATE ON public.security_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS ketat: client anon & authenticated DILARANG insert/update/delete langsung.
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_event_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.security_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_event_histories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.security_alerts FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.security_events TO service_role;
GRANT ALL ON TABLE public.security_event_histories TO service_role;
GRANT ALL ON TABLE public.security_alerts TO service_role;

GRANT SELECT ON TABLE public.security_events TO authenticated;
GRANT SELECT ON TABLE public.security_event_histories TO authenticated;
GRANT SELECT ON TABLE public.security_alerts TO authenticated;

DROP POLICY IF EXISTS security_events_select_authorized ON public.security_events;
CREATE POLICY security_events_select_authorized ON public.security_events
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'security.events.read'));

DROP POLICY IF EXISTS security_event_histories_select_authorized ON public.security_event_histories;
CREATE POLICY security_event_histories_select_authorized ON public.security_event_histories
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'security.events.view_details')
    OR public.has_permission(auth.uid(), 'security.events.read')
  );

DROP POLICY IF EXISTS security_alerts_select_authorized ON public.security_alerts;
CREATE POLICY security_alerts_select_authorized ON public.security_alerts
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'security.alerts.read')
    OR public.has_permission(auth.uid(), 'security.events.read')
  );

-- Daftarkan ke publikasi supabase_realtime untuk live refresh dashboard keamanan admin.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['security_events', 'security_alerts']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC RECORDING, DEDUPLIKASI & ALERT CORRELATION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_security_alert(
  _rule_code text,
  _title text,
  _description text,
  _severity text,
  _source_ip text,
  _actor_user_id uuid,
  _target_endpoint text,
  _event_id uuid,
  _dedup_key text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
BEGIN
  SELECT id INTO v_alert_id
    FROM public.security_alerts
   WHERE dedup_key = _dedup_key
     AND status IN ('OPEN', 'INVESTIGATING')
     AND last_triggered_at >= now() - interval '15 minutes'
   ORDER BY last_triggered_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_alert_id IS NOT NULL THEN
    UPDATE public.security_alerts
       SET trigger_count = trigger_count + 1,
           last_triggered_at = now(),
           sample_event_ids = CASE
             WHEN _event_id = ANY(sample_event_ids) THEN sample_event_ids
             WHEN cardinality(sample_event_ids) >= 10 THEN sample_event_ids[2:10] || _event_id
             ELSE sample_event_ids || _event_id
           END,
           metadata = CASE
             WHEN jsonb_typeof(_metadata) = 'object' THEN metadata || _metadata
             ELSE metadata
           END
     WHERE id = v_alert_id;
    RETURN v_alert_id;
  END IF;

  INSERT INTO public.security_alerts (
    rule_code, title, description, severity, source_ip, actor_user_id,
    target_endpoint, trigger_count, sample_event_ids, metadata, dedup_key
  ) VALUES (
    _rule_code, _title, _description, _severity, _source_ip, _actor_user_id,
    _target_endpoint, 1, ARRAY[_event_id], COALESCE(_metadata, '{}'::jsonb), _dedup_key
  ) RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_security_alert(text, text, text, text, text, uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_security_alert(text, text, text, text, text, uuid, text, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_security_event(
  _event_type text,
  _severity text,
  _category text,
  _endpoint text,
  _reason_code text,
  _request_id text,
  _actor_user_id uuid DEFAULT NULL,
  _actor_role text DEFAULT NULL,
  _actor_email_masked text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL,
  _http_method text DEFAULT 'POST',
  _route_template text DEFAULT NULL,
  _action_name text DEFAULT NULL,
  _target_resource_type text DEFAULT NULL,
  _target_resource_id text DEFAULT NULL,
  _status_code integer DEFAULT 403,
  _source_system text DEFAULT 'app_server',
  _dedup_key text DEFAULT NULL,
  _sanitized_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_effective_dedup text;
  v_alert_id uuid := NULL;
  v_subject_key text;
  v_recent_count integer := 0;
BEGIN
  IF _event_type IS NULL OR _endpoint IS NULL OR _reason_code IS NULL OR _request_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SECURITY_EVENT';
  END IF;

  v_effective_dedup := COALESCE(
    NULLIF(_dedup_key, ''),
    left(
      _event_type || ':' || COALESCE(_actor_user_id::text, _ip_address, 'anon') || ':' || _endpoint || ':' || _reason_code,
      240
    )
  );

  PERFORM pg_advisory_xact_lock(720001, hashtext(v_effective_dedup));

  -- Deduplikasi 5 menit untuk mencegah log flooding sambil tetap menghitung frekuensi nyata.
  SELECT id INTO v_event_id
    FROM public.security_events
   WHERE dedup_key = v_effective_dedup
     AND detection_status IN ('NEW', 'INVESTIGATING')
     AND last_seen_at >= now() - interval '5 minutes'
   ORDER BY last_seen_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_event_id IS NOT NULL THEN
    UPDATE public.security_events
       SET occurrence_count = occurrence_count + 1,
           last_seen_at = now(),
           request_id = _request_id,
           user_agent = COALESCE(NULLIF(_user_agent, ''), user_agent),
           sanitized_metadata = CASE
             WHEN jsonb_typeof(_sanitized_metadata) = 'object' THEN sanitized_metadata || _sanitized_metadata
             ELSE sanitized_metadata
           END
     WHERE id = v_event_id;
  ELSE
    INSERT INTO public.security_events (
      event_type, severity, category, actor_user_id, actor_role, actor_email_masked,
      ip_address, user_agent, http_method, endpoint, route_template, action_name,
      target_resource_type, target_resource_id, status_code, reason_code, request_id,
      source_system, dedup_key, sanitized_metadata
    ) VALUES (
      _event_type, _severity, _category, _actor_user_id, _actor_role, _actor_email_masked,
      _ip_address, _user_agent, COALESCE(NULLIF(_http_method, ''), 'POST'), _endpoint,
      _route_template, _action_name, _target_resource_type, _target_resource_id,
      COALESCE(_status_code, 403), _reason_code, _request_id,
      COALESCE(NULLIF(_source_system, ''), 'app_server'), v_effective_dedup,
      COALESCE(_sanitized_metadata, '{}'::jsonb)
    ) RETURNING id INTO v_event_id;
  END IF;

  v_subject_key := COALESCE(_ip_address, _actor_user_id::text, _endpoint);

  -- Rule 1: Upaya eskalasi hak akses / modifikasi pengaturan berbahaya (CRITICAL langsung)
  IF _event_type IN ('privilege_escalation_attempt', 'dangerous_setting_tamper') THEN
    v_alert_id := public.upsert_security_alert(
      'PRIVILEGE_ESCALATION_ATTEMPT',
      'Upaya Eskalasi Hak Akses Terdeteksi',
      'Terdeteksi percobaan modifikasi peran atau izin sensitif secara tidak sah pada ' || _endpoint,
      'CRITICAL',
      _ip_address,
      _actor_user_id,
      _endpoint,
      v_event_id,
      'PRIVILEGE_ESCALATION_ATTEMPT:' || v_subject_key,
      jsonb_build_object('event_type', _event_type, 'reason_code', _reason_code)
    );
  -- Rule 2: Pemalsuan signature webhook / token job internal >= 3x dalam 10 menit
  ELSIF _event_type IN ('invalid_webhook_signature', 'invalid_internal_job_token') THEN
    SELECT COALESCE(sum(occurrence_count), 0)::integer INTO v_recent_count
      FROM public.security_events
     WHERE event_type IN ('invalid_webhook_signature', 'invalid_internal_job_token')
       AND last_seen_at >= now() - interval '10 minutes'
       AND (
         (_ip_address IS NOT NULL AND ip_address = _ip_address)
         OR (_ip_address IS NULL AND endpoint = _endpoint)
       );
    IF v_recent_count >= 3 THEN
      v_alert_id := public.upsert_security_alert(
        'WEBHOOK_SIGNATURE_TAMPERING',
        'Kegagalan Verifikasi Webhook / Token Internal Berulang',
        'Tercatat ' || v_recent_count || ' kali penolakan signature/token dalam 10 menit terakhir pada ' || _endpoint,
        'CRITICAL',
        _ip_address,
        _actor_user_id,
        _endpoint,
        v_event_id,
        'WEBHOOK_SIGNATURE_TAMPERING:' || v_subject_key,
        jsonb_build_object('recent_count', v_recent_count)
      );
    END IF;
  -- Rule 3: Probing endpoint/rute admin atau sensitif berulang >= 5x dalam 5 menit
  ELSIF _event_type IN ('unauthenticated_sensitive_access', 'forbidden_admin_access', 'forbidden_permission_access') THEN
    SELECT COALESCE(sum(occurrence_count), 0)::integer INTO v_recent_count
      FROM public.security_events
     WHERE event_type IN ('unauthenticated_sensitive_access', 'forbidden_admin_access', 'forbidden_permission_access')
       AND last_seen_at >= now() - interval '5 minutes'
       AND (
         (_actor_user_id IS NOT NULL AND actor_user_id = _actor_user_id)
         OR (_ip_address IS NOT NULL AND ip_address = _ip_address)
       );
    IF v_recent_count >= 5 THEN
      v_alert_id := public.upsert_security_alert(
        'BRUTE_FORCE_ADMIN_PROBE',
        'Aktivitas Probing / Akses Tidak Sah Berulang',
        'Terdeteksi ' || v_recent_count || ' percobaan akses ditolak dalam 5 menit terakhir.',
        'HIGH',
        _ip_address,
        _actor_user_id,
        _endpoint,
        v_event_id,
        'BRUTE_FORCE_ADMIN_PROBE:' || v_subject_key,
        jsonb_build_object('recent_count', v_recent_count)
      );
    END IF;
  -- Rule 4: IDOR / ownership violation burst >= 8x dalam 5 menit
  ELSIF _event_type = 'ownership_violation_attempt' THEN
    SELECT COALESCE(sum(occurrence_count), 0)::integer INTO v_recent_count
      FROM public.security_events
     WHERE event_type = 'ownership_violation_attempt'
       AND last_seen_at >= now() - interval '5 minutes'
       AND (
         (_actor_user_id IS NOT NULL AND actor_user_id = _actor_user_id)
         OR (_ip_address IS NOT NULL AND ip_address = _ip_address)
       );
    IF v_recent_count >= 8 THEN
      v_alert_id := public.upsert_security_alert(
        'IDOR_ENUMERATION_BURST',
        'Indikasi Enumerasi / Percobaan IDOR',
        'Tercatat ' || v_recent_count || ' penolakan kepemilikan resource dalam 5 menit terakhir.',
        'HIGH',
        _ip_address,
        _actor_user_id,
        _endpoint,
        v_event_id,
        'IDOR_ENUMERATION_BURST:' || v_subject_key,
        jsonb_build_object('recent_count', v_recent_count)
      );
    END IF;
  -- Rule 5: Lonjakan pelanggaran rate limit >= 5x dalam 10 menit
  ELSIF _event_type = 'rate_limit_exceeded' THEN
    SELECT COALESCE(sum(occurrence_count), 0)::integer INTO v_recent_count
      FROM public.security_events
     WHERE event_type = 'rate_limit_exceeded'
       AND last_seen_at >= now() - interval '10 minutes'
       AND (
         (_actor_user_id IS NOT NULL AND actor_user_id = _actor_user_id)
         OR (_ip_address IS NOT NULL AND ip_address = _ip_address)
       );
    IF v_recent_count >= 5 THEN
      v_alert_id := public.upsert_security_alert(
        'RATE_LIMIT_ABUSE_SPIKE',
        'Lonjakan Pelanggaran Rate Limit',
        'Subjek melewati batas rate limit sebanyak ' || v_recent_count || ' kali dalam 10 menit.',
        'MEDIUM',
        _ip_address,
        _actor_user_id,
        _endpoint,
        v_event_id,
        'RATE_LIMIT_ABUSE_SPIKE:' || v_subject_key,
        jsonb_build_object('recent_count', v_recent_count)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'alert_id', v_alert_id,
    'request_id', _request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_security_event(
  text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, integer, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_security_event(
  text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, integer, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_old_security_events(_retention_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_events integer := 0;
  v_deleted_alerts integer := 0;
BEGIN
  IF _retention_days < 7 THEN
    RAISE EXCEPTION 'INVALID_RETENTION_DAYS';
  END IF;

  DELETE FROM public.security_events
   WHERE last_seen_at < now() - (_retention_days || ' days')::interval
     AND (
       detection_status IN ('RESOLVED', 'FALSE_POSITIVE', 'ACKNOWLEDGED')
       OR severity IN ('LOW', 'MEDIUM')
     );
  GET DIAGNOSTICS v_deleted_events = ROW_COUNT;

  DELETE FROM public.security_alerts
   WHERE last_triggered_at < now() - (_retention_days || ' days')::interval
     AND status IN ('RESOLVED', 'FALSE_POSITIVE', 'ACKNOWLEDGED');
  GET DIAGNOSTICS v_deleted_alerts = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_events', v_deleted_events,
    'deleted_alerts', v_deleted_alerts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_security_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_security_events(integer) TO service_role;
