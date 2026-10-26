-- ============================================================================
-- FASE 2.2 — ALUR EDITORIAL KONTEN
--
-- Tujuan: konten punya alur kerja nyata (ide sampai terbit) yang bisa dilacak,
-- bukan hanya draft/published. Tanpa ini, "dashboard konten" tidak punya apa
-- pun untuk ditampilkan selain daftar artikel.
--
-- Prinsip:
--   - Aditif: status lama (draft, published, archived) tetap sah.
--   - Setiap perpindahan status tercatat (siapa, kapan, dari ke mana).
--   - Checklist pra-terbit disimpan supaya bisa diperiksa sebelum publish.
--
-- Rollback: ALTER TABLE articles DROP CONSTRAINT articles_status_check;
--           ALTER TABLE articles ADD CONSTRAINT articles_status_check
--             CHECK (status IN ('draft','published','archived'));
--           DROP TABLE article_status_history;
--           ALTER TABLE articles DROP COLUMN checklist, DROP COLUMN scheduled_at;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Perluas status editorial. 'draft' dan 'published' dipertahankan agar
-- artikel lama tetap sah; 'review' dan 'scheduled' adalah status baru.
-- ---------------------------------------------------------------------------
ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_status_check
  CHECK (status IN ('idea','outline','draft','review','ready','scheduled','published','archived'));

-- Jadwal terbit (dipakai status 'scheduled').
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Checklist pra-terbit. Disimpan sebagai jsonb supaya butir bisa ditambah
-- tanpa migrasi baru; setiap butir menyimpan status centang + waktu.
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_articles_scheduled
  ON public.articles (scheduled_at)
  WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
-- Riwayat status: siapa memindahkan apa, kapan, dari status mana.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.article_status_history (
  id bigserial PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_history_article
  ON public.article_status_history (article_id, created_at DESC);

ALTER TABLE public.article_status_history ENABLE ROW LEVEL SECURITY;

-- Riwayat hanya untuk staf dengan izin melihat artikel.
DROP POLICY IF EXISTS article_history_select_staff ON public.article_status_history;
CREATE POLICY article_history_select_staff ON public.article_status_history
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'articles.view'));

GRANT SELECT ON public.article_status_history TO authenticated;
GRANT ALL ON public.article_status_history TO service_role;

-- ---------------------------------------------------------------------------
-- Pindahkan status artikel + catat riwayatnya dalam satu transaksi.
--
-- SECURITY DEFINER supaya pencatatan riwayat tidak bisa dilewati: pemanggil
-- boleh mengubah artikel, tapi riwayatnya selalu ikut tercatat.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_article_status(
  _article_id uuid,
  _new_status text,
  _note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_article public.articles;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_actor, 'articles.update') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _new_status NOT IN ('idea','outline','draft','review','ready','scheduled','published','archived') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT * INTO v_article FROM public.articles WHERE id = _article_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Tidak ada perubahan: jangan catat riwayat palsu.
  IF v_article.status = _new_status THEN
    RETURN jsonb_build_object('status', _new_status, 'changed', false);
  END IF;

  -- Publikasi wajib punya waktu terbit; kalau belum ada, isi sekarang.
  UPDATE public.articles
     SET status = _new_status,
         published_at = CASE
           WHEN _new_status = 'published' AND published_at IS NULL THEN now()
           ELSE published_at
         END
   WHERE id = _article_id;

  INSERT INTO public.article_status_history (article_id, from_status, to_status, actor_id, note)
  VALUES (_article_id, v_article.status, _new_status, v_actor, NULLIF(btrim(COALESCE(_note, '')), ''));

  RETURN jsonb_build_object('status', _new_status, 'changed', true, 'from', v_article.status);
END; $$;

REVOKE EXECUTE ON FUNCTION public.set_article_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_article_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ringkasan konten untuk dashboard: jumlah per status + beban penulis.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'by_status', (
      SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
      FROM (
        SELECT status, count(*) n FROM public.articles
         WHERE deleted_at IS NULL GROUP BY status
      ) t
    ),
    'total', (SELECT count(*) FROM public.articles WHERE deleted_at IS NULL),
    'published', (SELECT count(*) FROM public.articles WHERE status = 'published' AND deleted_at IS NULL),
    'scheduled', (SELECT count(*) FROM public.articles WHERE status = 'scheduled' AND deleted_at IS NULL),
    'by_author', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('author', author, 'count', n) ORDER BY n DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(NULLIF(author_name, ''), 'Tanpa nama') author, count(*) n
          FROM public.articles WHERE deleted_at IS NULL GROUP BY 1
      ) t
    ),
    'top_articles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'views', views) ORDER BY views DESC), '[]'::jsonb)
      FROM (
        SELECT title, slug, COALESCE(view_count, 0) views
          FROM public.articles
         WHERE status = 'published' AND deleted_at IS NULL
         ORDER BY COALESCE(view_count, 0) DESC
         LIMIT 10
      ) t
    ),
    'recent_changes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('title', title, 'from', from_status, 'to', to_status, 'at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (
        SELECT a.title, h.from_status, h.to_status, h.created_at
          FROM public.article_status_history h
          JOIN public.articles a ON a.id = h.article_id
         ORDER BY h.created_at DESC LIMIT 10
      ) t
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.content_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_summary() TO authenticated;
