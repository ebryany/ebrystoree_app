ALTER TABLE public.product_reviews ADD COLUMN reviewer_name text;

CREATE OR REPLACE FUNCTION public.submit_product_review(
  _product_id uuid,
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
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Harus masuk terlebih dahulu';
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'Rating harus 1 sampai 5';
  END IF;

  SELECT o.id INTO _order
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = _product_id
    AND o.user_id = _uid
    AND o.status IN ('paid','processing','delivered','completed')
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF _order IS NULL THEN
    RAISE EXCEPTION 'Hanya pembeli produk ini yang dapat memberi ulasan';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.full_name), ''), 'Pembeli Ebrystore') INTO _name
  FROM public.profiles p WHERE p.id = _uid;

  INSERT INTO public.product_reviews (product_id, order_id, user_id, rating, title, body, reviewer_name)
  VALUES (_product_id, _order, _uid, _rating, NULLIF(trim(_title), ''), NULLIF(trim(_body), ''), COALESCE(_name, 'Pembeli Ebrystore'))
  ON CONFLICT (product_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        reviewer_name = EXCLUDED.reviewer_name,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_product_review(uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_review(uuid, smallint, text, text) TO authenticated, service_role;