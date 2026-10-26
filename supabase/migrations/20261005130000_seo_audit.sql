-- ============================================================================
-- FASE 2.1 — SEO AUDIT ON-PAGE
--
-- Tujuan: memeriksa halaman sendiri (title, description, H1, alt, canonical,
-- robots, structured data) dan menyimpan hasilnya supaya dashboard SEO punya
-- data nyata. Tanpa API eksternal, tanpa biaya.
--
-- Prinsip:
--   - Yang diperiksa adalah halaman NYATA dari sitemap, bukan daftar tebakan.
--   - Hasil disimpan dengan waktu pemeriksaan; audit ulang menimpa hasil lama
--     untuk URL yang sama (bukan menumpuk tanpa batas).
--   - Setiap jenis masalah punya kode stabil supaya bisa dihitung dan dilacak.
--
-- Rollback: DROP TABLE seo_audit_results;
--           DROP FUNCTION record_seo_audit, seo_audit_summary;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seo_audit_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_path text NOT NULL,
  -- Kode masalah stabil, mis. 'title_missing', 'title_too_long'.
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('error','warning','info')),
  detail text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  -- Satu URL tidak boleh punya masalah yang sama dua kali.
  UNIQUE (url_path, issue_code)
);

CREATE INDEX IF NOT EXISTS idx_seo_audit_severity
  ON public.seo_audit_results (severity, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_audit_path
  ON public.seo_audit_results (url_path);

ALTER TABLE public.seo_audit_results ENABLE ROW LEVEL SECURITY;

-- Hanya staf dengan izin dashboard yang boleh melihat hasil audit.
DROP POLICY IF EXISTS seo_audit_select_staff ON public.seo_audit_results;
CREATE POLICY seo_audit_select_staff ON public.seo_audit_results
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'admin.dashboard.view'));

GRANT SELECT ON public.seo_audit_results TO authenticated;
GRANT ALL ON public.seo_audit_results TO service_role;

-- ---------------------------------------------------------------------------
-- Simpan hasil audit satu halaman. Menimpa hasil lama untuk URL yang sama.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_seo_audit(_url_path text, _issues jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_issue jsonb;
  v_count integer := 0;
BEGIN
  -- Buang hasil lama halaman ini supaya tidak menumpuk lintas waktu.
  DELETE FROM public.seo_audit_results WHERE url_path = _url_path;

  IF _issues IS NULL OR jsonb_typeof(_issues) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR v_issue IN SELECT * FROM jsonb_array_elements(_issues)
  LOOP
    INSERT INTO public.seo_audit_results (url_path, issue_code, severity, detail, checked_at)
    VALUES (
      _url_path,
      COALESCE(v_issue->>'code', 'unknown'),
      COALESCE(v_issue->>'severity', 'warning'),
      v_issue->>'detail',
      now()
    )
    ON CONFLICT (url_path, issue_code)
    DO UPDATE SET severity = EXCLUDED.severity, detail = EXCLUDED.detail, checked_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_seo_audit(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_seo_audit(text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Ringkasan untuk dashboard: berapa halaman diperiksa, berapa bermasalah.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seo_audit_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pages_checked', (SELECT count(DISTINCT url_path) FROM public.seo_audit_results),
    'pages_with_issues', (
      SELECT count(DISTINCT url_path) FROM public.seo_audit_results WHERE severity IN ('error','warning')
    ),
    'total_issues', (SELECT count(*) FROM public.seo_audit_results),
    'by_severity', (
      SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb)
      FROM (SELECT severity, count(*) n FROM public.seo_audit_results GROUP BY severity) t
    ),
    'by_code', (
      SELECT COALESCE(jsonb_object_agg(issue_code, n), '{}'::jsonb)
      FROM (SELECT issue_code, count(*) n FROM public.seo_audit_results GROUP BY issue_code) t
    ),
    'last_checked_at', (SELECT max(checked_at) FROM public.seo_audit_results)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.seo_audit_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_audit_summary() TO authenticated;
