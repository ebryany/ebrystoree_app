-- Ikuti toko + suka produk + notifikasi produk baru untuk pengikut.
--
-- Penulisan hanya lewat RPC (toggle_*), tabel tidak memberi hak tulis langsung.
-- Agregat publik (jumlah pengikut/suka, rating) lewat RPC store_social_summary /
-- product_like_summary; daftar pengikut per user tidak pernah diekspos.
-- Produk platform (store_id NULL) dihitung sebagai milik toko is_platform.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_notify_store_followers ON public.digital_products;
--   DROP FUNCTION IF EXISTS public.notify_store_followers_new_product();
--   DROP FUNCTION IF EXISTS public.toggle_store_follow(uuid);
--   DROP FUNCTION IF EXISTS public.toggle_product_like(uuid);
--   DROP FUNCTION IF EXISTS public.store_social_summary(uuid);
--   DROP FUNCTION IF EXISTS public.product_like_summary(uuid);
--   DROP FUNCTION IF EXISTS public.product_is_public(uuid);
--   DROP TABLE IF EXISTS public.product_follow_notices, public.product_likes, public.store_follows;

CREATE TABLE IF NOT EXISTS public.store_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_id)
);
CREATE INDEX IF NOT EXISTS store_follows_store_idx ON public.store_follows (store_id);

CREATE TABLE IF NOT EXISTS public.product_likes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
CREATE INDEX IF NOT EXISTS product_likes_product_idx ON public.product_likes (product_id);

-- Penanda: produk ini sudah pernah diumumkan ke pengikut (cegah spam saat
-- produk di-unpublish lalu publish ulang).
CREATE TABLE IF NOT EXISTS public.product_follow_notices (
  product_id uuid PRIMARY KEY REFERENCES public.digital_products(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_follow_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_follows_select_own ON public.store_follows;
CREATE POLICY store_follows_select_own ON public.store_follows
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS product_likes_select_own ON public.product_likes;
CREATE POLICY product_likes_select_own ON public.product_likes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.store_follows, public.product_likes, public.product_follow_notices
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_follows, public.product_likes TO authenticated;
GRANT ALL ON public.store_follows, public.product_likes, public.product_follow_notices TO service_role;

-- ---------------------------------------------------------------------------
-- Helper: produk terlihat publik (cermin policy products_select_public).
CREATE OR REPLACE FUNCTION public.product_is_public(_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.digital_products dp
    WHERE dp.id = _product_id
      AND dp.status = 'published'
      AND dp.deleted_at IS NULL
      AND dp.moderation_status = 'approved'
      AND (dp.store_id IS NULL OR public.store_is_publicly_visible(dp.store_id))
  );
$$;
REVOKE ALL ON FUNCTION public.product_is_public(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_store_follow(_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_following boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT owner_id INTO v_owner FROM public.stores
   WHERE id = _store_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_FOUND'; END IF;
  IF v_owner = v_uid THEN RAISE EXCEPTION 'OWN_STORE'; END IF;

  DELETE FROM public.store_follows WHERE user_id = v_uid AND store_id = _store_id;
  IF FOUND THEN
    v_following := false;
  ELSE
    INSERT INTO public.store_follows (user_id, store_id) VALUES (v_uid, _store_id);
    v_following := true;
  END IF;

  RETURN jsonb_build_object(
    'following', v_following,
    'followers', (SELECT count(*) FROM public.store_follows WHERE store_id = _store_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_store_follow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_store_follow(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_product_like(_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_liked boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  DELETE FROM public.product_likes WHERE user_id = v_uid AND product_id = _product_id;
  IF FOUND THEN
    v_liked := false;
  ELSE
    IF NOT public.product_is_public(_product_id) THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
    INSERT INTO public.product_likes (user_id, product_id) VALUES (v_uid, _product_id);
    v_liked := true;
  END IF;

  RETURN jsonb_build_object(
    'liked', v_liked,
    'likes', (SELECT count(*) FROM public.product_likes WHERE product_id = _product_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_product_like(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_product_like(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_like_summary(_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'likes', (SELECT count(*) FROM public.product_likes WHERE product_id = _product_id),
    'liked', COALESCE(auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.product_likes WHERE product_id = _product_id AND user_id = auth.uid()
    ), false)
  )
  WHERE public.product_is_public(_product_id);
$$;
REVOKE ALL ON FUNCTION public.product_like_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_like_summary(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ringkasan sosial toko: pengikut, total suka produk, rating, status ikuti
-- pemanggil. Produk platform (store_id NULL) ikut dihitung untuk toko resmi.
CREATE OR REPLACE FUNCTION public.store_social_summary(_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT id, is_platform FROM public.stores WHERE id = _store_id AND status = 'active'
  ),
  p AS (
    SELECT dp.id FROM public.digital_products dp, s
     WHERE (dp.store_id = s.id OR (s.is_platform AND dp.store_id IS NULL))
       AND dp.status = 'published' AND dp.deleted_at IS NULL
       AND dp.moderation_status = 'approved'
  )
  SELECT jsonb_build_object(
    'followers', (SELECT count(*) FROM public.store_follows WHERE store_id = _store_id),
    'following', COALESCE(auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.store_follows WHERE store_id = _store_id AND user_id = auth.uid()
    ), false),
    'likes', (SELECT count(*) FROM public.product_likes pl WHERE pl.product_id IN (SELECT id FROM p)),
    'rating_average', (SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)
                         FROM public.product_reviews r
                        WHERE r.is_visible AND r.product_id IN (SELECT id FROM p)),
    'rating_total', (SELECT count(*) FROM public.product_reviews r
                      WHERE r.is_visible AND r.product_id IN (SELECT id FROM p))
  )
  FROM s;
$$;
REVOKE ALL ON FUNCTION public.store_social_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_social_summary(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notifikasi pengikut saat produk pertama kali tampil publik.
CREATE OR REPLACE FUNCTION public.notify_store_followers_new_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_store_id uuid;
  v_store_name text;
  v_owner uuid;
BEGIN
  IF NEW.status <> 'published' OR NEW.deleted_at IS NOT NULL
     OR NEW.moderation_status <> 'approved' OR COALESCE(NEW.is_test_data, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND OLD.deleted_at IS NULL
     AND OLD.moderation_status = 'approved' THEN
    RETURN NEW;
  END IF;

  IF NEW.store_id IS NULL THEN
    SELECT id, name, owner_id INTO v_store_id, v_store_name, v_owner
      FROM public.stores WHERE is_platform AND status = 'active'
     ORDER BY created_at LIMIT 1;
  ELSE
    SELECT id, name, owner_id INTO v_store_id, v_store_name, v_owner
      FROM public.stores WHERE id = NEW.store_id AND status = 'active';
  END IF;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.product_follow_notices (product_id) VALUES (NEW.id)
    ON CONFLICT (product_id) DO NOTHING;
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  SELECT f.user_id, 'store.new_product',
         left('Produk baru dari ' || v_store_name, 160),
         left(NEW.name, 300),
         'product', NEW.id
    FROM public.store_follows f
   WHERE f.store_id = v_store_id
     AND f.user_id IS DISTINCT FROM v_owner;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_store_followers_new_product() FROM PUBLIC, anon, authenticated;

-- Produk yang sudah tampil saat migrasi dianggap sudah diumumkan.
INSERT INTO public.product_follow_notices (product_id)
SELECT id FROM public.digital_products
 WHERE status = 'published' AND deleted_at IS NULL AND moderation_status = 'approved'
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS trg_notify_store_followers ON public.digital_products;
CREATE TRIGGER trg_notify_store_followers
  AFTER INSERT OR UPDATE OF status, moderation_status, deleted_at ON public.digital_products
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_followers_new_product();
