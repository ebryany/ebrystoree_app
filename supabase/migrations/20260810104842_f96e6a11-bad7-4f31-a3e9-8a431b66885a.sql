CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

CREATE INDEX idx_product_reviews_product ON public.product_reviews(product_id, is_visible);

GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read visible reviews"
ON public.product_reviews FOR SELECT TO anon, authenticated
USING (is_visible = true);

CREATE POLICY "Owners can read own reviews"
ON public.product_reviews FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can read all reviews"
ON public.product_reviews FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE POLICY "Buyers can create review for purchased product"
ON public.product_reviews FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = product_reviews.product_id
      AND o.user_id = auth.uid()
      AND o.status IN ('paid','processing','delivered','completed')
  )
);

CREATE POLICY "Owners can update own reviews"
ON public.product_reviews FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can delete own reviews"
ON public.product_reviews FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can moderate reviews"
ON public.product_reviews FOR UPDATE TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_product_reviews_updated_at
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.product_rating_summary()
RETURNS TABLE(product_id uuid, average_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.product_id, round(avg(r.rating)::numeric, 2), count(*)
  FROM public.product_reviews r
  WHERE r.is_visible = true
  GROUP BY r.product_id
$$;

REVOKE EXECUTE ON FUNCTION public.product_rating_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_rating_summary() TO anon, authenticated, service_role;