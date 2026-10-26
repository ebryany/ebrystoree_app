-- ============================================================================
-- FASE 2.3 — KAMPANYE, UTM, DAN ATRIBUSI
--
-- Tujuan: tahu kanal mana yang menghasilkan uang, bukan hanya klik.
--
-- Prinsip:
--   - Atribusi berbasis sesi: kunjungan dengan hash sesi yang sama dengan
--     kunjungan pertama sebelum order dianggap sebagai sumber order itu.
--   - Batas metode DINYATAKAN: atribusi sesi tidak sempurna (orang ganti
--     perangkat, sesi berganti tiap hari). Batas ini ditulis di komentar dan
--     dokumen definisi metrik supaya tidak diklaim lebih akurat dari kenyataan.
--   - Tidak ada data pribadi: atribusi memakai hash sesi, bukan identitas.
--
-- Rollback: DROP TABLE campaigns; DROP FUNCTION utm_link, campaign_attribution,
--           upsert_campaign, list_campaigns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Kanal: instagram, tiktok, google, whatsapp, email, lain-lain.
  channel text NOT NULL,
  utm_source text NOT NULL,
  utm_medium text,
  utm_campaign text NOT NULL,
  -- Periode kampanye (opsional; kosong berarti berjalan terus).
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','finished')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Satu kombinasi UTM tidak boleh punya dua kampanye: kalau boleh, atribusi
  -- jadi ambigu dan angkanya tidak bisa dipercaya.
  UNIQUE (utm_source, utm_campaign)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns (status, created_at DESC);

DROP TRIGGER IF EXISTS campaigns_set_updated_at ON public.campaigns;
CREATE TRIGGER campaigns_set_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select_staff ON public.campaigns;
CREATE POLICY campaigns_select_staff ON public.campaigns
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'admin.dashboard.view'));

GRANT SELECT ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

-- ---------------------------------------------------------------------------
-- Buat / perbarui kampanye.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_campaign(
  _id uuid,
  _name text,
  _channel text,
  _utm_source text,
  _utm_medium text,
  _utm_campaign text,
  _starts_at timestamptz DEFAULT NULL,
  _ends_at timestamptz DEFAULT NULL,
  _status text DEFAULT 'active',
  _note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'admin.dashboard.view') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF btrim(COALESCE(_name, '')) = '' THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF btrim(COALESCE(_utm_source, '')) = '' THEN RAISE EXCEPTION 'UTM_SOURCE_REQUIRED'; END IF;
  IF btrim(COALESCE(_utm_campaign, '')) = '' THEN RAISE EXCEPTION 'UTM_CAMPAIGN_REQUIRED'; END IF;
  IF _status NOT IN ('draft','active','paused','finished') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.campaigns
      (name, channel, utm_source, utm_medium, utm_campaign, starts_at, ends_at, status, note, created_by)
    VALUES
      (btrim(_name), btrim(_channel), btrim(_utm_source), NULLIF(btrim(COALESCE(_utm_medium,'')),''),
       btrim(_utm_campaign), _starts_at, _ends_at, _status, NULLIF(btrim(COALESCE(_note,'')),''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.campaigns
       SET name = btrim(_name), channel = btrim(_channel),
           utm_source = btrim(_utm_source), utm_medium = NULLIF(btrim(COALESCE(_utm_medium,'')),''),
           utm_campaign = btrim(_utm_campaign), starts_at = _starts_at, ends_at = _ends_at,
           status = _status, note = NULLIF(btrim(COALESCE(_note,'')),'')
     WHERE id = _id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END; $$;

REVOKE EXECUTE ON FUNCTION public.upsert_campaign(uuid,text,text,text,text,text,timestamptz,timestamptz,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_campaign(uuid,text,text,text,text,text,timestamptz,timestamptz,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atribusi: hubungkan kunjungan ke order.
--
-- CARA KERJA: untuk setiap order dalam periode, cari kunjungan dengan hash sesi
-- yang sama pada 7 hari sebelum order dibuat. Sumber diambil dari kunjungan
-- pertama sesi itu.
--
-- BATAS METODE (dinyatakan tegas, jangan diklaim lebih):
--   - Sesi berganti setiap hari, jadi perjalanan lebih dari sehari tidak
--     terhubung. Angka ini UNDERCOUNT, bukan overcount.
--   - Order tanpa kunjungan tercatat muncul sebagai 'tidak terlacak'.
--   - Tidak bisa membedakan dua orang yang memakai jaringan sama.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_attribution(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH periode AS (
    SELECT now() - (_days || ' days')::interval AS sejak
  ),
  order_sesi AS (
    -- Order dalam periode, dengan hash sesi dari kunjungan sebelum order.
    SELECT o.id AS order_id,
           o.total,
           (
             SELECT e.session_hash
               FROM public.analytics_events e
              WHERE e.is_bot = false
                AND e.created_at BETWEEN o.created_at - interval '7 days' AND o.created_at
              ORDER BY e.created_at DESC
              LIMIT 1
           ) AS session_hash
      FROM public.orders o, periode p
     WHERE o.created_at >= p.sejak
       AND o.status IN ('paid','completed')
  ),
  sumber AS (
    SELECT os.order_id, os.total,
           COALESCE(
             (SELECT COALESCE(NULLIF(e.utm_source,''), NULLIF(e.referrer_host,''), 'langsung')
                FROM public.analytics_events e
               WHERE e.session_hash = os.session_hash AND e.is_bot = false
               ORDER BY e.created_at ASC LIMIT 1),
             'tidak terlacak'
           ) AS sumber
      FROM order_sesi os
  )
  SELECT jsonb_build_object(
    'periode_hari', _days,
    'total_order', (SELECT count(*) FROM sumber),
    'total_nilai', (SELECT COALESCE(SUM(total),0) FROM sumber),
    'per_sumber', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sumber', sumber, 'order', n, 'nilai', nilai
      ) ORDER BY nilai DESC), '[]'::jsonb)
      FROM (
        SELECT sumber, count(*) n, SUM(total) nilai
          FROM sumber GROUP BY sumber
      ) t
    ),
    'batas_metode', 'Atribusi berbasis sesi harian; perjalanan lebih dari sehari tidak terhubung. Angka ini undercount.'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.campaign_attribution(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_attribution(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Daftar kampanye + performanya (kunjungan & konversi dari event).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_campaigns()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'channel', c.channel, 'status', c.status,
    'utm_source', c.utm_source, 'utm_medium', c.utm_medium, 'utm_campaign', c.utm_campaign,
    'starts_at', c.starts_at, 'ends_at', c.ends_at,
    'kunjungan', COALESCE((
      SELECT count(*) FROM public.analytics_events e
       WHERE e.utm_campaign = c.utm_campaign AND e.utm_source = c.utm_source
         AND e.is_bot = false AND e.event_type = 'page_view'
    ), 0),
    'checkout', COALESCE((
      SELECT count(*) FROM public.analytics_events e
       WHERE e.utm_campaign = c.utm_campaign AND e.utm_source = c.utm_source
         AND e.is_bot = false AND e.event_type = 'checkout_start'
    ), 0)
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  FROM public.campaigns c;
$$;

REVOKE EXECUTE ON FUNCTION public.list_campaigns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campaigns() TO authenticated;
