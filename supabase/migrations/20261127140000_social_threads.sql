-- ============================================================================
-- Ebrystore Social Media (Threads-style) Schema, RLS, Counter Triggers & RPCs
-- Additive & idempotent migration. Zero destructive changes to existing tables.
-- ============================================================================

-- 1. Public-safe social profile (handle & bio) without exposing sensitive profiles.email/phone
CREATE TABLE IF NOT EXISTS public.social_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL,
  display_name text,
  bio text NOT NULL DEFAULT '',
  followers_count integer NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  following_count integer NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_profiles_handle_format CHECK (handle ~ '^[a-z0-9._]{3,28}$'),
  CONSTRAINT social_profiles_bio_length CHECK (char_length(bio) <= 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_profiles_handle_lower
  ON public.social_profiles (lower(handle));

-- 2. Main Threads posts table (supports root posts, multi-post thread chains, nested replies,
--    pure reposts, quote posts, up to 4 images, and embedded Ebrystore products/services)
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  root_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  repost_of_id uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  is_repost_only boolean NOT NULL DEFAULT false,
  body text NOT NULL DEFAULT '',
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  hashtags text[] NOT NULL DEFAULT '{}'::text[],
  attached_product_id uuid REFERENCES public.digital_products(id) ON DELETE SET NULL,
  attached_service_id uuid REFERENCES public.marketplace_services(id) ON DELETE SET NULL,
  attached_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  reply_policy text NOT NULL DEFAULT 'everyone'
    CHECK (reply_policy IN ('everyone', 'followers', 'mentioned')),
  likes_count integer NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  replies_count integer NOT NULL DEFAULT 0 CHECK (replies_count >= 0),
  reposts_count integer NOT NULL DEFAULT 0 CHECK (reposts_count >= 0),
  quotes_count integer NOT NULL DEFAULT 0 CHECK (quotes_count >= 0),
  bookmarks_count integer NOT NULL DEFAULT 0 CHECK (bookmarks_count >= 0),
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT social_posts_body_len CHECK (char_length(body) <= 500),
  CONSTRAINT social_posts_media_is_array CHECK (jsonb_typeof(media) = 'array' AND jsonb_array_length(media) <= 4),
  CONSTRAINT social_posts_has_content CHECK (
    is_repost_only = true
    OR char_length(btrim(body)) > 0
    OR jsonb_array_length(media) > 0
    OR attached_product_id IS NOT NULL
    OR attached_service_id IS NOT NULL
    OR repost_of_id IS NOT NULL
  ),
  CONSTRAINT social_posts_pure_repost_target CHECK (
    is_repost_only = false OR repost_of_id IS NOT NULL
  )
);

-- Cursor pagination & feed indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_feed_cursor
  ON public.social_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_author_cursor
  ON public.social_posts (author_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_root_tree
  ON public.social_posts (root_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_parent_replies
  ON public.social_posts (parent_id, created_at ASC, id ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_posts_commerce_feed
  ON public.social_posts (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND parent_id IS NULL AND (attached_product_id IS NOT NULL OR attached_service_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_social_posts_hashtags_gin
  ON public.social_posts USING gin (hashtags);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_unique_pure_repost
  ON public.social_posts (author_id, repost_of_id)
  WHERE is_repost_only = true AND deleted_at IS NULL;

-- 3. Likes
CREATE TABLE IF NOT EXISTS public.social_post_likes (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_likes_user
  ON public.social_post_likes (user_id, created_at DESC);

-- 4. Bookmarks
CREATE TABLE IF NOT EXISTS public.social_post_bookmarks (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_social_post_bookmarks_user
  ON public.social_post_bookmarks (user_id, created_at DESC);

-- 5. User-to-user social graph follows
CREATE TABLE IF NOT EXISTS public.social_follows (
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT social_follows_no_self CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_follows_following
  ON public.social_follows (following_id, created_at DESC);

-- 6. Abuse reports (moderation queue)
CREATE TABLE IF NOT EXISTS public.social_post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam', 'scam', 'harassment', 'inappropriate', 'other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

-- ============================================================================
-- Atomic counter triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.social_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_profiles_updated_at ON public.social_profiles;
CREATE TRIGGER trg_social_profiles_updated_at
  BEFORE UPDATE ON public.social_profiles
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

DROP TRIGGER IF EXISTS trg_social_posts_updated_at ON public.social_posts;
CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_touch_updated_at();

-- Maintain likes_count
CREATE OR REPLACE FUNCTION public.social_sync_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_post_likes_count ON public.social_post_likes;
CREATE TRIGGER trg_social_post_likes_count
  AFTER INSERT OR DELETE ON public.social_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.social_sync_like_count();

-- Maintain bookmarks_count
CREATE OR REPLACE FUNCTION public.social_sync_bookmark_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts SET bookmarks_count = bookmarks_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts SET bookmarks_count = GREATEST(0, bookmarks_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_post_bookmarks_count ON public.social_post_bookmarks;
CREATE TRIGGER trg_social_post_bookmarks_count
  AFTER INSERT OR DELETE ON public.social_post_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.social_sync_bookmark_count();

-- Maintain replies_count, reposts_count, quotes_count on insert & soft-delete
CREATE OR REPLACE FUNCTION public.social_sync_post_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE public.social_posts SET replies_count = replies_count + 1 WHERE id = NEW.parent_id;
      IF NEW.root_id IS NOT NULL AND NEW.root_id <> NEW.parent_id THEN
        UPDATE public.social_posts SET replies_count = replies_count + 1 WHERE id = NEW.root_id;
      END IF;
    END IF;
    IF NEW.repost_of_id IS NOT NULL THEN
      IF NEW.is_repost_only THEN
        UPDATE public.social_posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id;
      ELSE
        UPDATE public.social_posts SET quotes_count = quotes_count + 1 WHERE id = NEW.repost_of_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE public.social_posts SET replies_count = GREATEST(0, replies_count - 1) WHERE id = OLD.parent_id;
      IF OLD.root_id IS NOT NULL AND OLD.root_id <> OLD.parent_id THEN
        UPDATE public.social_posts SET replies_count = GREATEST(0, replies_count - 1) WHERE id = OLD.root_id;
      END IF;
    END IF;
    IF OLD.repost_of_id IS NOT NULL THEN
      IF OLD.is_repost_only THEN
        UPDATE public.social_posts SET reposts_count = GREATEST(0, reposts_count - 1) WHERE id = OLD.repost_of_id;
      ELSE
        UPDATE public.social_posts SET quotes_count = GREATEST(0, quotes_count - 1) WHERE id = OLD.repost_of_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_posts_relations ON public.social_posts;
CREATE TRIGGER trg_social_posts_relations
  AFTER INSERT OR UPDATE OF deleted_at ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_sync_post_relations();

-- Maintain followers_count & following_count
CREATE OR REPLACE FUNCTION public.social_sync_follow_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_profiles SET following_count = following_count + 1 WHERE user_id = NEW.follower_id;
    UPDATE public.social_profiles SET followers_count = followers_count + 1 WHERE user_id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = OLD.follower_id;
    UPDATE public.social_profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE user_id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_follows_counts ON public.social_follows;
CREATE TRIGGER trg_social_follows_counts
  AFTER INSERT OR DELETE ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION public.social_sync_follow_counts();

-- ============================================================================
-- Atomic toggle RPCs (concurrency-safe, strict auth.uid())
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_social_post_like(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_liked boolean;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.social_posts WHERE id = _post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF EXISTS (SELECT 1 FROM public.social_post_likes WHERE post_id = _post_id AND user_id = v_uid) THEN
    DELETE FROM public.social_post_likes WHERE post_id = _post_id AND user_id = v_uid;
    v_liked := false;
  ELSE
    INSERT INTO public.social_post_likes (post_id, user_id) VALUES (_post_id, v_uid) ON CONFLICT DO NOTHING;
    v_liked := true;
  END IF;

  SELECT likes_count INTO v_count FROM public.social_posts WHERE id = _post_id;
  RETURN jsonb_build_object('liked', v_liked, 'likes_count', COALESCE(v_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_social_post_bookmark(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_saved boolean;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.social_posts WHERE id = _post_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF EXISTS (SELECT 1 FROM public.social_post_bookmarks WHERE post_id = _post_id AND user_id = v_uid) THEN
    DELETE FROM public.social_post_bookmarks WHERE post_id = _post_id AND user_id = v_uid;
    v_saved := false;
  ELSE
    INSERT INTO public.social_post_bookmarks (post_id, user_id) VALUES (_post_id, v_uid) ON CONFLICT DO NOTHING;
    v_saved := true;
  END IF;

  SELECT bookmarks_count INTO v_count FROM public.social_posts WHERE id = _post_id;
  RETURN jsonb_build_object('bookmarked', v_saved, 'bookmarks_count', COALESCE(v_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_social_post_repost(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target_id uuid;
  v_existing_id uuid;
  v_reposted boolean;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- If user clicks repost on a pure repost wrapper, target the original post instead
  SELECT CASE WHEN is_repost_only AND repost_of_id IS NOT NULL THEN repost_of_id ELSE id END
  INTO v_target_id
  FROM public.social_posts
  WHERE id = _post_id AND deleted_at IS NULL;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.social_posts
  WHERE author_id = v_uid AND repost_of_id = v_target_id AND is_repost_only = true AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.social_posts SET deleted_at = now() WHERE id = v_existing_id;
    v_reposted := false;
  ELSE
    INSERT INTO public.social_posts (author_id, repost_of_id, is_repost_only, body)
    VALUES (v_uid, v_target_id, true, '');
    v_reposted := true;
  END IF;

  SELECT reposts_count INTO v_count FROM public.social_posts WHERE id = v_target_id;
  RETURN jsonb_build_object('reposted', v_reposted, 'reposts_count', COALESCE(v_count, 0), 'target_id', v_target_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_social_follow(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_following boolean;
  v_followers_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF v_uid = _target_user_id THEN
    RAISE EXCEPTION 'CANNOT_FOLLOW_SELF';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.social_follows
    WHERE follower_id = v_uid AND following_id = _target_user_id
  ) THEN
    DELETE FROM public.social_follows
    WHERE follower_id = v_uid AND following_id = _target_user_id;
    v_following := false;
  ELSE
    INSERT INTO public.social_follows (follower_id, following_id)
    VALUES (v_uid, _target_user_id)
    ON CONFLICT DO NOTHING;
    v_following := true;
  END IF;

  SELECT followers_count INTO v_followers_count
  FROM public.social_profiles
  WHERE user_id = _target_user_id;

  RETURN jsonb_build_object('following', v_following, 'followers_count', COALESCE(v_followers_count, 0));
END;
$$;

-- ============================================================================
-- Row Level Security & Least-Privilege Grants
-- ============================================================================

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.social_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.social_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_post_likes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_post_bookmarks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.social_follows TO authenticated;
GRANT SELECT, INSERT ON public.social_post_reports TO authenticated;

GRANT ALL ON public.social_profiles TO service_role;
GRANT ALL ON public.social_posts TO service_role;
GRANT ALL ON public.social_post_likes TO service_role;
GRANT ALL ON public.social_post_bookmarks TO service_role;
GRANT ALL ON public.social_follows TO service_role;
GRANT ALL ON public.social_post_reports TO service_role;

GRANT EXECUTE ON FUNCTION public.toggle_social_post_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_social_post_bookmark(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_social_post_repost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_social_follow(uuid) TO authenticated;

-- social_profiles policies
DROP POLICY IF EXISTS "social_profiles_select_auth" ON public.social_profiles;
CREATE POLICY "social_profiles_select_auth" ON public.social_profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "social_profiles_insert_own" ON public.social_profiles;
CREATE POLICY "social_profiles_insert_own" ON public.social_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "social_profiles_update_own" ON public.social_profiles;
CREATE POLICY "social_profiles_update_own" ON public.social_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- social_posts policies
DROP POLICY IF EXISTS "social_posts_select_visible" ON public.social_posts;
CREATE POLICY "social_posts_select_visible" ON public.social_posts
  FOR SELECT TO authenticated USING (deleted_at IS NULL OR author_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "social_posts_insert_own" ON public.social_posts;
CREATE POLICY "social_posts_insert_own" ON public.social_posts
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "social_posts_update_own_or_admin" ON public.social_posts;
CREATE POLICY "social_posts_update_own_or_admin" ON public.social_posts
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.is_admin(auth.uid()));

-- social_post_likes policies
DROP POLICY IF EXISTS "social_post_likes_select_auth" ON public.social_post_likes;
CREATE POLICY "social_post_likes_select_auth" ON public.social_post_likes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "social_post_likes_insert_own" ON public.social_post_likes;
CREATE POLICY "social_post_likes_insert_own" ON public.social_post_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "social_post_likes_delete_own" ON public.social_post_likes;
CREATE POLICY "social_post_likes_delete_own" ON public.social_post_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- social_post_bookmarks policies (private to owner!)
DROP POLICY IF EXISTS "social_post_bookmarks_select_own" ON public.social_post_bookmarks;
CREATE POLICY "social_post_bookmarks_select_own" ON public.social_post_bookmarks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "social_post_bookmarks_insert_own" ON public.social_post_bookmarks;
CREATE POLICY "social_post_bookmarks_insert_own" ON public.social_post_bookmarks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "social_post_bookmarks_delete_own" ON public.social_post_bookmarks;
CREATE POLICY "social_post_bookmarks_delete_own" ON public.social_post_bookmarks
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- social_follows policies
DROP POLICY IF EXISTS "social_follows_select_auth" ON public.social_follows;
CREATE POLICY "social_follows_select_auth" ON public.social_follows
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "social_follows_insert_own" ON public.social_follows;
CREATE POLICY "social_follows_insert_own" ON public.social_follows
  FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid() AND follower_id <> following_id);

DROP POLICY IF EXISTS "social_follows_delete_own" ON public.social_follows;
CREATE POLICY "social_follows_delete_own" ON public.social_follows
  FOR DELETE TO authenticated USING (follower_id = auth.uid());

-- social_post_reports policies
DROP POLICY IF EXISTS "social_post_reports_select_own_or_admin" ON public.social_post_reports;
CREATE POLICY "social_post_reports_select_own_or_admin" ON public.social_post_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "social_post_reports_insert_own" ON public.social_post_reports;
CREATE POLICY "social_post_reports_insert_own" ON public.social_post_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());

-- ============================================================================
-- Realtime publication registration (idempotent)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'social_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.social_posts;
  END IF;
END $$;
