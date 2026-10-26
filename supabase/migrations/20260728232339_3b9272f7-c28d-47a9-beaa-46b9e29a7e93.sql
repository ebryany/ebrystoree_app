CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL DEFAULT '',
  cover_url text,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  reading_minutes integer NOT NULL DEFAULT 1,
  author_id uuid,
  author_name text,
  published_at timestamptz,
  view_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT articles_status_check CHECK (status IN ('draft','published','archived'))
);

CREATE INDEX articles_published_idx ON public.articles (published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;

GRANT SELECT ON public.articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "articles_public_read" ON public.articles
FOR SELECT TO anon, authenticated
USING (status = 'published' AND deleted_at IS NULL);

CREATE POLICY "articles_staff_read" ON public.articles
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'articles.view'));

CREATE POLICY "articles_staff_insert" ON public.articles
FOR INSERT TO authenticated
WITH CHECK (public.has_permission(auth.uid(), 'articles.create'));

CREATE POLICY "articles_staff_update" ON public.articles
FOR UPDATE TO authenticated
USING (public.has_permission(auth.uid(), 'articles.update'))
WITH CHECK (public.has_permission(auth.uid(), 'articles.update'));

CREATE POLICY "articles_staff_delete" ON public.articles
FOR DELETE TO authenticated
USING (public.has_permission(auth.uid(), 'articles.delete'));

CREATE TRIGGER articles_set_updated_at BEFORE UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('articles.view','Konten','Melihat daftar artikel di dashboard admin', false),
  ('articles.create','Konten','Membuat artikel baru', false),
  ('articles.update','Konten','Mengubah dan menerbitkan artikel', false),
  ('articles.delete','Konten','Menghapus artikel', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r.role, p.key
FROM (VALUES ('admin'::app_role), ('super_admin'::app_role)) AS r(role)
CROSS JOIN (VALUES ('articles.view'),('articles.create'),('articles.update'),('articles.delete')) AS p(key)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'support'::app_role, k FROM (VALUES ('articles.view'),('articles.create'),('articles.update')) AS t(k)
ON CONFLICT DO NOTHING;