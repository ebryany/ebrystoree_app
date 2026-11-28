CREATE TABLE IF NOT EXISTS public.social_thread_realtime_signals (
  signal_key text PRIMARY KEY,
  post_id uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('poll', 'deleted')),
  parent_id uuid,
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  CHECK ((kind = 'poll' AND post_id IS NOT NULL AND signal_key = post_id::text)
      OR (kind = 'deleted' AND signal_key = 'deleted' AND post_id IS NULL AND parent_id IS NULL))
);

ALTER TABLE public.social_thread_realtime_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_thread_realtime_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.social_thread_realtime_signals TO authenticated;
DROP POLICY IF EXISTS social_thread_signals_select ON public.social_thread_realtime_signals;
CREATE POLICY social_thread_signals_select ON public.social_thread_realtime_signals
  FOR SELECT TO authenticated USING (
    kind = 'deleted' OR EXISTS (
      SELECT 1 FROM public.social_posts p
      WHERE p.id = post_id AND p.deleted_at IS NULL
    )
  );

REVOKE SELECT ON public.social_post_poll_votes FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS social_post_poll_votes_select_auth ON public.social_post_poll_votes;

CREATE OR REPLACE FUNCTION public.emit_social_thread_realtime_signal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'social_post_poll_votes' THEN
    INSERT INTO public.social_thread_realtime_signals (signal_key, post_id, kind, parent_id)
    SELECT id::text, id, 'poll', parent_id FROM public.social_posts
    WHERE id = NEW.post_id AND deleted_at IS NULL
    ON CONFLICT (signal_key) DO UPDATE SET revision = excluded.revision, parent_id = excluded.parent_id;
  ELSE
    -- Use one invalidation row rather than revealing which post was removed.
    INSERT INTO public.social_thread_realtime_signals (signal_key, kind)
    VALUES ('deleted', 'deleted')
    ON CONFLICT (signal_key) DO UPDATE SET revision = excluded.revision;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_social_thread_realtime_signal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS social_poll_realtime_signal ON public.social_post_poll_votes;
CREATE TRIGGER social_poll_realtime_signal
  AFTER INSERT OR UPDATE OF option_index ON public.social_post_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.emit_social_thread_realtime_signal();

DROP TRIGGER IF EXISTS social_post_deleted_realtime_signal ON public.social_posts;
CREATE TRIGGER social_post_deleted_realtime_signal
  AFTER UPDATE OF deleted_at ON public.social_posts FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.emit_social_thread_realtime_signal();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public' AND tablename = 'social_post_poll_votes') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.social_post_poll_votes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public' AND tablename = 'social_thread_realtime_signals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_thread_realtime_signals;
  END IF;
END $$;
