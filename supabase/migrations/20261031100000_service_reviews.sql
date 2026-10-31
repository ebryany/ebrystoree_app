-- Ulasan jasa seller (marketplace_services), setara product_reviews.
-- - Terverifikasi: pembeli yang pesanannya sudah diterima (work_state = 'accepted'),
--   ditulis lewat RPC submit_service_review (SECURITY DEFINER).
-- - Tamu: user_id NULL, is_verified false; ditulis server (service_role) dengan rate limit.
-- Anon/authenticated tidak punya akses tabel langsung; pembacaan publik lewat server.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.submit_service_review(uuid, smallint, text, text);
--   DROP TABLE IF EXISTS public.marketplace_service_reviews;

CREATE TABLE public.marketplace_service_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.marketplace_services(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id uuid,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text CHECK (title IS NULL OR length(title) <= 120),
  body text CHECK (body IS NULL OR length(body) <= 1000),
  reviewer_name text,
  is_verified boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, user_id),
  CHECK (user_id IS NOT NULL OR (reviewer_name IS NOT NULL AND length(trim(reviewer_name)) >= 2))
);

CREATE INDEX idx_service_reviews_service ON public.marketplace_service_reviews (service_id, is_visible, created_at DESC);
CREATE INDEX idx_service_reviews_store ON public.marketplace_service_reviews (store_id, is_visible);

CREATE TRIGGER trg_service_reviews_updated_at
BEFORE UPDATE ON public.marketplace_service_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.marketplace_service_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_service_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketplace_service_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.submit_service_review(
  _service_id uuid,
  _rating smallint,
  _title text DEFAULT NULL,
  _body text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
  _order uuid;
  _store uuid;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Harus masuk terlebih dahulu';
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'Rating harus 1 sampai 5';
  END IF;

  -- Hanya pembeli yang sudah menerima hasil jasa ini.
  SELECT mso.order_id, mso.store_id INTO _order, _store
  FROM public.marketplace_service_orders mso
  JOIN public.orders o ON o.id = mso.order_id
  WHERE mso.service_id = _service_id
    AND o.user_id = _uid
    AND mso.work_state = 'accepted'
  ORDER BY mso.accepted_at DESC NULLS LAST
  LIMIT 1;

  IF _order IS NULL THEN
    RAISE EXCEPTION 'Hanya pembeli yang sudah menerima hasil jasa ini yang dapat memberi ulasan';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Pembeli Ebrystore') INTO _name
  FROM public.profiles p WHERE p.id = _uid;

  INSERT INTO public.marketplace_service_reviews
    (service_id, store_id, order_id, user_id, rating, title, body, reviewer_name, is_verified)
  VALUES
    (_service_id, _store, _order, _uid, _rating, NULLIF(trim(_title), ''), NULLIF(trim(_body), ''),
     COALESCE(_name, 'Pembeli Ebrystore'), true)
  ON CONFLICT (service_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        reviewer_name = EXCLUDED.reviewer_name,
        order_id = EXCLUDED.order_id,
        is_verified = true,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_service_review(uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_review(uuid, smallint, text, text) TO authenticated, service_role;
