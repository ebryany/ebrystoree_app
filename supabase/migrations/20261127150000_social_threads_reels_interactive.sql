-- ============================================================================
-- Ebrystore Threads v2 + P0 Security Hardening:
-- - Short Video Reels (`social-reels` bucket), Polls, Auto-DM, Freebie Lock
-- - P0 #1: Revoke direct client INSERT/UPDATE on `social_posts` & lock counters
-- - P0 #2: Isolate secret `freebie_url` into `social_post_freebies` (service_role only)
-- - P0 #3: Atomic once-per-user Auto-DM delivery table & `claim_social_auto_dm` RPC
-- - P0 #4: Multi-worker DB idempotency `client_message_id` on `product_inquiry_messages`
-- - P0 #5: Lock `increment_social_post_view` to `service_role` only
-- 100% additive & idempotent migration. Zero destructive data changes.
-- ============================================================================

-- 1. Private storage bucket for short vertical Reels videos (up to 30 MB, MP4/WebM)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-reels',
  'social-reels',
  false,
  31457280,
  ARRAY['video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 31457280,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Extend public.social_posts with Reels, Auto-DM, and Poll metadata
--    (NOTE: secret freebie URL is stored in isolated `social_post_freebies` table, NOT here!)
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS post_kind text NOT NULL DEFAULT 'thread',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_poster_url text,
  ADD COLUMN IF NOT EXISTS video_duration_sec integer,
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_dm_keyword text,
  ADD COLUMN IF NOT EXISTS auto_dm_message text,
  ADD COLUMN IF NOT EXISTS auto_dm_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS poll_options jsonb,
  ADD COLUMN IF NOT EXISTS poll_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_freebie boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_post_kind_check') THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_post_kind_check CHECK (post_kind IN ('thread', 'reel'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_video_duration_check') THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_video_duration_check
      CHECK (video_duration_sec IS NULL OR video_duration_sec BETWEEN 1 AND 180);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_views_nonneg') THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_views_nonneg CHECK (views_count >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_auto_dm_keyword_len') THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_auto_dm_keyword_len
      CHECK (auto_dm_keyword IS NULL OR char_length(btrim(auto_dm_keyword)) BETWEEN 2 AND 32);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_auto_dm_message_len') THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_auto_dm_message_len
      CHECK (auto_dm_message IS NULL OR char_length(auto_dm_message) <= 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_posts_poll_options_check') THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_poll_options_check
      CHECK (
        poll_options IS NULL OR (
          jsonb_typeof(poll_options) = 'array'
          AND jsonb_array_length(poll_options) BETWEEN 2 AND 4
        )
      );
  END IF;
END $$;

-- Allow Reels, Polls, or Freebies even with short/empty caption
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_has_content;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_has_content CHECK (
    is_repost_only = true
    OR char_length(btrim(body)) > 0
    OR jsonb_array_length(media) > 0
    OR video_url IS NOT NULL
    OR poll_options IS NOT NULL
    OR has_freebie = true
    OR attached_product_id IS NOT NULL
    OR attached_service_id IS NOT NULL
    OR repost_of_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_social_posts_reels_cursor
  ON public.social_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_id IS NULL AND post_kind = 'reel';

-- ============================================================================
-- P0 #1: Lock social_posts writes & protect counters from client tampering
-- ============================================================================
REVOKE INSERT, UPDATE, DELETE ON public.social_posts FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "social_posts_insert_own" ON public.social_posts;
DROP POLICY IF EXISTS "social_posts_update_own_or_admin" ON public.social_posts;

-- Protect follower/following counters on social_profiles from direct client UPDATE
CREATE OR REPLACE FUNCTION public.social_protect_profile_counters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.followers_count := OLD.followers_count;
    NEW.following_count := OLD.following_count;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_profiles_protect_counters ON public.social_profiles;
CREATE TRIGGER trg_social_profiles_protect_counters
  BEFORE UPDATE ON public.social_profiles
  FOR EACH ROW EXECUTE FUNCTION public.social_protect_profile_counters();

-- Protect post engagement counters if any non-service-role path ever touches social_posts
CREATE OR REPLACE FUNCTION public.social_protect_post_counters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.likes_count := OLD.likes_count;
    NEW.replies_count := OLD.replies_count;
    NEW.reposts_count := OLD.reposts_count;
    NEW.quotes_count := OLD.quotes_count;
    NEW.bookmarks_count := OLD.bookmarks_count;
    NEW.views_count := OLD.views_count;
    NEW.auto_dm_count := OLD.auto_dm_count;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_posts_protect_counters ON public.social_posts;
CREATE TRIGGER trg_social_posts_protect_counters
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_protect_post_counters();

-- ============================================================================
-- P0 #2: Isolated Freebie Lead-Magnet storage (service_role ONLY, zero PostgREST leak)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.social_post_freebies (
  post_id uuid PRIMARY KEY REFERENCES public.social_posts(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  url text NOT NULL CHECK (url ~ '^https?://'),
  requires_follow boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_post_freebies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_post_freebies FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_post_freebies TO service_role;

-- ============================================================================
-- P0 #3: Once-per-user Auto-DM delivery ledger + atomic claim RPC (anti-spam)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.social_post_auto_dm_deliveries (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inquiry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, recipient_id)
);

ALTER TABLE public.social_post_auto_dm_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_post_auto_dm_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_post_auto_dm_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.claim_social_auto_dm(
  _post_id uuid,
  _recipient_id uuid,
  _inquiry_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.social_post_auto_dm_deliveries (post_id, recipient_id, inquiry_id)
  VALUES (_post_id, _recipient_id, _inquiry_id)
  ON CONFLICT (post_id, recipient_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 1 THEN
    UPDATE public.social_posts
    SET auto_dm_count = auto_dm_count + 1
    WHERE id = _post_id;
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_social_auto_dm(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_social_auto_dm(uuid, uuid, uuid) TO service_role;

-- ============================================================================
-- Interactive Poll votes table + atomic RPC
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.social_post_poll_votes (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index smallint NOT NULL CHECK (option_index BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_poll_votes_post
  ON public.social_post_poll_votes (post_id, option_index);

ALTER TABLE public.social_post_poll_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_post_poll_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.social_post_poll_votes TO authenticated;
GRANT ALL ON public.social_post_poll_votes TO service_role;

DROP POLICY IF EXISTS "social_post_poll_votes_select_auth" ON public.social_post_poll_votes;
CREATE POLICY "social_post_poll_votes_select_auth" ON public.social_post_poll_votes
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.vote_social_poll(_post_id uuid, _option_index smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_options jsonb;
  v_expires timestamptz;
  v_len integer;
  v_counts jsonb;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT poll_options, poll_expires_at
  INTO v_options, v_expires
  FROM public.social_posts
  WHERE id = _post_id AND deleted_at IS NULL;

  IF v_options IS NULL THEN
    RAISE EXCEPTION 'POLL_NOT_FOUND';
  END IF;
  IF v_expires IS NOT NULL AND v_expires < now() THEN
    RAISE EXCEPTION 'POLL_EXPIRED';
  END IF;

  v_len := jsonb_array_length(v_options);
  IF _option_index < 0 OR _option_index >= v_len THEN
    RAISE EXCEPTION 'INVALID_OPTION';
  END IF;

  INSERT INTO public.social_post_poll_votes (post_id, user_id, option_index)
  VALUES (_post_id, v_uid, _option_index)
  ON CONFLICT (post_id, user_id)
  DO UPDATE SET option_index = EXCLUDED.option_index, created_at = now();

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'index', idx,
          'votes', COALESCE(cnt.c, 0)
        )
        ORDER BY idx
      ),
      '[]'::jsonb
    ),
    COALESCE(SUM(COALESCE(cnt.c, 0)), 0)::integer
  INTO v_counts, v_total
  FROM generate_series(0, v_len - 1) AS idx
  LEFT JOIN (
    SELECT option_index, COUNT(*)::integer AS c
    FROM public.social_post_poll_votes
    WHERE post_id = _post_id
    GROUP BY option_index
  ) cnt ON cnt.option_index = idx;

  RETURN jsonb_build_object(
    'viewer_option', _option_index,
    'counts', v_counts,
    'total_votes', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_social_poll(uuid, smallint) TO authenticated;

-- ============================================================================
-- P0 #5: Reel view counter locked to service_role (rate-limited by server fn)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.increment_social_post_view(_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_views integer;
BEGIN
  UPDATE public.social_posts
  SET views_count = views_count + 1
  WHERE id = _post_id AND deleted_at IS NULL
  RETURNING views_count INTO v_views;
  RETURN COALESCE(v_views, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_social_post_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_social_post_view(uuid) TO service_role;

-- ============================================================================
-- P0 #4: Multi-worker DB idempotency for Chat messages
-- ============================================================================
ALTER TABLE public.product_inquiry_messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_inquiry_messages_client_id
  ON public.product_inquiry_messages (inquiry_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
