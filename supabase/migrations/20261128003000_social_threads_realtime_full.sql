-- ============================================================================
-- Ebrystore Social Threads Full Multi-User Realtime Publication
-- Do not publish raw poll votes when this version is applied for the first time.
-- ============================================================================

REVOKE SELECT ON public.social_post_poll_votes FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['social_posts', 'social_profiles']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = tbl
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
