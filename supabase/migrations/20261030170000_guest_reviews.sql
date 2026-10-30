-- Ulasan publik tanpa akun, untuk pelanggan yang dulu bertransaksi di luar web
-- (mis. WhatsApp). Ulasan tamu disimpan dengan user_id NULL dan is_verified
-- false, sehingga tampil dengan label berbeda dari pembeli terverifikasi.
-- Penulisan ulasan tamu hanya lewat server (service_role) dengan rate limit;
-- anon tetap tidak punya hak tulis ke tabel ini.

ALTER TABLE public.product_reviews ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Semua ulasan lama dibuat lewat jalur pembeli.
UPDATE public.product_reviews SET is_verified = true WHERE user_id IS NOT NULL;

-- Ulasan tamu wajib bernama; ulasan akun wajib punya user_id.
ALTER TABLE public.product_reviews DROP CONSTRAINT IF EXISTS product_reviews_guest_name;
ALTER TABLE public.product_reviews ADD CONSTRAINT product_reviews_guest_name
  CHECK (user_id IS NOT NULL OR (reviewer_name IS NOT NULL AND length(trim(reviewer_name)) >= 2));

-- Status terverifikasi hanya ditentukan sistem, tidak bisa diubah pemilik ulasan.
-- SECURITY INVOKER (default) disengaja: current_user harus pemanggil asli;
-- submit_product_review (SECURITY DEFINER milik postgres) tetap lolos.
CREATE OR REPLACE FUNCTION public.guard_review_verified()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
  ELSE
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_reviews_guard_verified ON public.product_reviews;
CREATE TRIGGER trg_product_reviews_guard_verified
BEFORE INSERT OR UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.guard_review_verified();

REVOKE ALL ON FUNCTION public.guard_review_verified() FROM PUBLIC, anon, authenticated;

-- Jalur pembeli: tandai terverifikasi.
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

  INSERT INTO public.product_reviews (product_id, order_id, user_id, rating, title, body, reviewer_name, is_verified)
  VALUES (_product_id, _order, _uid, _rating, NULLIF(trim(_title), ''), NULLIF(trim(_body), ''), COALESCE(_name, 'Pembeli Ebrystore'), true)
  ON CONFLICT (product_id, user_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        reviewer_name = EXCLUDED.reviewer_name,
        is_verified = true,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN jsonb_build_object('id', _id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_product_review(uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_product_review(uuid, smallint, text, text) TO authenticated, service_role;
