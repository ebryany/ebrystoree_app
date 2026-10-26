-- ============================================================================
-- Aksi tulis dashboard Pertumbuhan
--
-- Tujuan: dashboard /see bukan lagi halaman baca saja. Tiga kemampuan yang
-- belum ada diisi di sini:
--   1. Hapus kampanye (sebelumnya hanya bisa dibuat).
--   2. Abaikan temuan SEO yang sudah diketahui (mis. canonical sengaja kosong),
--      supaya daftar temuan hanya berisi hal yang benar-benar perlu dikerjakan.
--   3. Simpan checklist pra-terbit artikel.
--
-- Prinsip:
--   - Semua memeriksa izin di server; UI bukan penjaga.
--   - Penghapusan kampanye TIDAK menghapus riwayat kunjungan; atribusi historis
--     tetap utuh karena analytics_events menyimpan utm_campaign sebagai teks.
--   - Temuan SEO yang diabaikan tidak dihapus, hanya ditandai, supaya bisa
--     dibuka kembali kapan saja.
--
-- Rollback:
--   DROP FUNCTION public.delete_campaign(uuid);
--   DROP FUNCTION public.ignore_seo_issue(text, text, boolean);
--   DROP FUNCTION public.save_article_checklist(uuid, jsonb);
--   ALTER TABLE public.seo_audit_results DROP COLUMN IF EXISTS ignored_at, DROP COLUMN IF EXISTS ignored_by;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Hapus kampanye.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_campaign(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'admin.dashboard.view') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  DELETE FROM public.campaigns WHERE id = _id RETURNING name INTO v_name;
  IF v_name IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Catatan: analytics_events tidak menyimpan campaign_id, jadi riwayat
  -- kunjungan dan atribusi tetap bisa dibaca setelah kampanye dihapus.
  RETURN jsonb_build_object('deleted', true, 'name', v_name);
END; $$;

REVOKE EXECUTE ON FUNCTION public.delete_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_campaign(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Abaikan / buka kembali temuan SEO.
--
-- "Diabaikan" berarti temuan tetap tersimpan tapi tidak dihitung sebagai
-- pekerjaan. Ini berbeda dari dihapus: riwayat audit tetap jujur.
-- ---------------------------------------------------------------------------
ALTER TABLE public.seo_audit_results
  ADD COLUMN IF NOT EXISTS ignored_at timestamptz,
  ADD COLUMN IF NOT EXISTS ignored_by uuid;

CREATE OR REPLACE FUNCTION public.ignore_seo_issue(
  _url_path text,
  _issue_code text,
  _ignored boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'admin.dashboard.view') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  UPDATE public.seo_audit_results
     SET ignored_at = CASE WHEN _ignored THEN now() ELSE NULL END,
         ignored_by = CASE WHEN _ignored THEN auth.uid() ELSE NULL END
   WHERE url_path = _url_path AND issue_code = _issue_code;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  RETURN jsonb_build_object('ignored', _ignored, 'url_path', _url_path, 'issue_code', _issue_code);
END; $$;

REVOKE EXECUTE ON FUNCTION public.ignore_seo_issue(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ignore_seo_issue(text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Checklist pra-terbit artikel.
--
-- Kolom `checklist` sudah ada sejak migrasi content_workflow; fungsi ini yang
-- menulisnya, karena update artikel biasa tidak menyentuh kolom ini.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_article_checklist(_article_id uuid, _checklist jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'articles.update') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _checklist IS NULL OR jsonb_typeof(_checklist) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CHECKLIST';
  END IF;

  UPDATE public.articles
     SET checklist = _checklist, updated_at = now()
   WHERE id = _article_id AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  RETURN jsonb_build_object('saved', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.save_article_checklist(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_article_checklist(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ringkasan SEO: kecualikan temuan yang diabaikan dari hitungan pekerjaan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seo_audit_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pages_checked', (SELECT count(DISTINCT url_path) FROM public.seo_audit_results),
    'pages_with_issues', (
      SELECT count(DISTINCT url_path) FROM public.seo_audit_results
       WHERE ignored_at IS NULL AND severity IN ('error','warning')
    ),
    'total_issues', (SELECT count(*) FROM public.seo_audit_results WHERE ignored_at IS NULL),
    'ignored_issues', (SELECT count(*) FROM public.seo_audit_results WHERE ignored_at IS NOT NULL),
    'last_checked_at', (SELECT max(checked_at) FROM public.seo_audit_results),
    'by_severity', (
      SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb)
      FROM (
        SELECT severity, count(*) n FROM public.seo_audit_results
         WHERE ignored_at IS NULL GROUP BY severity
      ) t
    ),
    'by_code', (
      SELECT COALESCE(jsonb_object_agg(issue_code, n), '{}'::jsonb)
      FROM (
        SELECT issue_code, count(*) n FROM public.seo_audit_results
         WHERE ignored_at IS NULL GROUP BY issue_code
      ) t
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.seo_audit_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_audit_summary() TO authenticated;
