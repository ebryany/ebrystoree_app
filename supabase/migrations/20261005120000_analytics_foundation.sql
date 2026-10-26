-- ============================================================================
-- ANALYTICS: FONDASI DASHBOARD PERTUMBUHAN (marketing/konten/SEO)
--
-- Tujuan: mencatat kunjungan dan konversi secara agregat, TANPA data pribadi,
-- sebagai sumber data dashboard marketing/konten/SEO.
--
-- Prinsip:
--   - Tanpa data pribadi: tidak ada IP mentah, tidak ada user-agent mentah,
--     tidak ada cookie lintas situs. Pengunjung diwakili hash sesi harian.
--   - Agregat harian supaya dashboard tidak menghitung ulang jutaan baris.
--   - view_count artikel akhirnya punya jalur penulisan yang benar (sebelumnya
--     kolomnya ada tapi tidak pernah diisi — bug yang sama seperti sold_count).
--
-- Rollback: DROP TABLE analytics_events, analytics_daily;
--           DROP FUNCTION record_article_view, aggregate_analytics_daily,
--           purge_analytics_events;
--           DROP FUNCTION job_aggregate_analytics, job_purge_analytics.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Event mentah. Disimpan singkat (lihat O-23), lalu diagregasi.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN ('page_view','product_view','service_view','article_view','checkout_start','payment_success')),
  path text NOT NULL,
  -- Hash sesi harian: tidak bisa dilacak balik ke orang, hanya untuk menghitung
  -- pengunjung unik dalam satu hari.
  session_hash text NOT NULL,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  -- Penanda bot supaya bisa dikecualikan dari metrik (definisi metrik).
  is_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON public.analytics_events (event_type, created_at DESC);

-- Tidak ada akses klien langsung: hanya service role (endpoint tracking dan job).
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_select_staff ON public.analytics_events;
CREATE POLICY analytics_events_select_staff ON public.analytics_events
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'admin.dashboard.view'));

GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

-- ---------------------------------------------------------------------------
-- Agregat harian. Inilah yang dibaca dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day date NOT NULL,
  metric text NOT NULL,
  dimension text NOT NULL DEFAULT '',
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, metric, dimension)
);

ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_daily_select_staff ON public.analytics_daily;
CREATE POLICY analytics_daily_select_staff ON public.analytics_daily
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'admin.dashboard.view'));

GRANT SELECT ON public.analytics_daily TO authenticated;
GRANT ALL ON public.analytics_daily TO service_role;

-- ---------------------------------------------------------------------------
-- Catat tampilan artikel + naikkan view_count.
--
-- SECURITY DEFINER karena pembaca artikel tidak punya izin tulis ke articles,
-- dan menaikkan view_count harus tetap terjadi walau pembaca anonim.
-- Idempotensi tidak dipakai di sini: satu tampilan = satu kenaikan, dan
-- penyaringan bot dilakukan di sisi pemanggil (endpoint).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_article_view(_slug text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_views bigint;
BEGIN
  UPDATE public.articles
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE slug = _slug AND status = 'published' AND deleted_at IS NULL
  RETURNING view_count INTO v_views;

  RETURN COALESCE(v_views, 0);
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_article_view(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_article_view(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Agregasi harian dari event mentah. Idempoten per hari: hitung ulang hari itu
-- dan ganti nilainya, supaya bisa dijalankan berkali-kali tanpa menggandakan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aggregate_analytics_daily(_day date DEFAULT (now() AT TIME ZONE 'Asia/Makassar')::date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows integer := 0;
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  -- Batas hari dalam zona WIB (Asia/Makassar) supaya "hari" konsisten dengan
  -- cara admin membacanya.
  v_from := (_day::timestamp AT TIME ZONE 'Asia/Makassar');
  v_to := ((_day + 1)::timestamp AT TIME ZONE 'Asia/Makassar');

  -- Buang agregat lama untuk hari ini, lalu hitung ulang.
  DELETE FROM public.analytics_daily WHERE day = _day;

  -- Kunjungan (hanya non-bot).
  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'page_views', '', count(*)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
  HAVING count(*) > 0;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Pengunjung unik harian (hash sesi).
  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'unique_visitors', '', count(DISTINCT session_hash)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
  HAVING count(DISTINCT session_hash) > 0;

  -- Per jenis event.
  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'events', event_type, count(*)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
   GROUP BY event_type
  HAVING count(*) > 0;

  -- Sumber kunjungan (utm_source atau host referrer).
  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'sources',
         COALESCE(NULLIF(utm_source, ''), NULLIF(referrer_host, ''), 'langsung'),
         count(*)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
     AND event_type = 'page_view'
   GROUP BY 3
  HAVING count(*) > 0;

  -- Halaman terpopuler.
  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'top_pages', path, count(*)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
     AND event_type = 'page_view'
   GROUP BY path
  HAVING count(*) > 0;

  -- Konversi (dari event, bukan dari tabel orders — orders dipakai untuk nilai uang).
  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'funnel', 'checkout_start', count(*)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
     AND event_type = 'checkout_start'
  HAVING count(*) > 0;

  INSERT INTO public.analytics_daily (day, metric, dimension, value)
  SELECT _day, 'funnel', 'payment_success', count(*)
    FROM public.analytics_events
   WHERE created_at >= v_from AND created_at < v_to AND is_bot = false
     AND event_type = 'payment_success'
  HAVING count(*) > 0;

  RETURN jsonb_build_object('day', _day, 'written', v_rows);
END; $$;

REVOKE EXECUTE ON FUNCTION public.aggregate_analytics_daily(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_analytics_daily(date) TO service_role;

-- ---------------------------------------------------------------------------
-- Retensi (O-23): buang event mentah lebih tua dari N hari.
-- Agregat harian TIDAK dihapus — itu yang disimpan permanen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_analytics_events(_keep_days integer DEFAULT 90)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.analytics_events
   WHERE created_at < now() - (_keep_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $$;

REVOKE EXECUTE ON FUNCTION public.purge_analytics_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_analytics_events(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Job untuk pg_cron.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_aggregate_analytics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Hari ini dan kemarin, supaya data yang masuk lewat tengah malam tetap benar.
  PERFORM public.aggregate_analytics_daily((now() AT TIME ZONE 'Asia/Makassar')::date);
  PERFORM public.aggregate_analytics_daily(((now() AT TIME ZONE 'Asia/Makassar')::date - 1));
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.job_aggregate_analytics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_aggregate_analytics() TO service_role;

CREATE OR REPLACE FUNCTION public.job_purge_analytics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted integer;
BEGIN
  v_deleted := public.purge_analytics_events(90);
  RETURN jsonb_build_object('deleted', v_deleted);
END; $$;

REVOKE EXECUTE ON FUNCTION public.job_purge_analytics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_purge_analytics() TO service_role;

-- Jadwalkan: agregasi tiap jam, pembersihan harian.
DO $$
DECLARE j bigint;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname IN ('aggregate_analytics','purge_analytics') LOOP
    PERFORM cron.unschedule(j);
  END LOOP;
END $$;

SELECT cron.schedule('aggregate_analytics', '7 * * * *', $job$SELECT public.job_aggregate_analytics()$job$);
SELECT cron.schedule('purge_analytics', '30 3 * * *', $job$SELECT public.job_purge_analytics()$job$);
