-- ============================================================================
-- MARKETPLACE — PROMPT 16: Search Lintas Seller (Full-Text Search)
--
-- Tujuan: pencarian produk digital menggunakan full-text search (tsvector + GIN)
--         agar hasilnya lebih cepat dan bisa diranking. Menggantikan ILIKE.
--         Hasil pencarian juga mengembalikan info toko (store_name, store_slug).
--
-- Sifat: ADITIF. Kolom baru, index baru, RPC baru.
-- Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop trigger, index, column, function di bawah ini.
-- ============================================================================

-- 1) Kolom tsvector pada digital_products ------------------------------------
ALTER TABLE public.digital_products
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2) Function untuk generate search vector -----------------------------------
CREATE OR REPLACE FUNCTION public.build_product_search_vector(
  _name text,
  _short_description text,
  _description text
) RETURNS tsvector
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    setweight(to_tsvector('indonesian', coalesce(_name, '')), 'A') ||
    setweight(to_tsvector('indonesian', coalesce(_short_description, '')), 'B') ||
    setweight(to_tsvector('indonesian', coalesce(_description, '')), 'C');
$$;

-- 3) Trigger: update search_vector saat name/description berubah -------------
CREATE OR REPLACE FUNCTION public.trg_update_product_search_vector()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := build_product_search_vector(
    NEW.name, NEW.short_description, NEW.description
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_search_vector ON public.digital_products;
CREATE TRIGGER trg_product_search_vector
  BEFORE INSERT OR UPDATE OF name, short_description, description
  ON public.digital_products
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_product_search_vector();

-- 4) Backfill search_vector untuk produk existing -----------------------------
UPDATE public.digital_products
   SET search_vector = build_product_search_vector(name, short_description, description)
 WHERE search_vector IS NULL;

-- 5) GIN index ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_digital_products_search
  ON public.digital_products USING GIN (search_vector);

-- 6) RPC: full-text search products with store info ---------------------------
CREATE OR REPLACE FUNCTION public.search_products_fts(
  _query text DEFAULT '',
  _category_slug text DEFAULT NULL,
  _store_slug text DEFAULT NULL,
  _limit int DEFAULT 48,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  short_description text,
  thumbnail_url text,
  price bigint,
  discount_price bigint,
  category_id uuid,
  store_name text,
  store_slug text,
  is_official boolean,
  rank real
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tsquery tsquery;
  v_category_id uuid;
  v_store_id uuid;
BEGIN
  -- Parse query (tolerate invalid input)
  IF length(btrim(_query)) > 0 THEN
    BEGIN
      v_tsquery := websearch_to_tsquery('indonesian', _query);
    EXCEPTION WHEN OTHERS THEN
      v_tsquery := plainto_tsquery('indonesian', _query);
    END;
  END IF;

  -- Resolve category slug
  IF _category_slug IS NOT NULL AND length(_category_slug) > 0 THEN
    SELECT c.id INTO v_category_id FROM public.categories c WHERE c.slug = _category_slug LIMIT 1;
    IF v_category_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Resolve store slug
  IF _store_slug IS NOT NULL AND length(_store_slug) > 0 THEN
    SELECT s.id INTO v_store_id FROM public.stores s WHERE s.slug = _store_slug AND s.status = 'active' LIMIT 1;
    IF v_store_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      dp.id,
      dp.name,
      dp.slug,
      dp.short_description,
      dp.thumbnail_url,
      dp.price,
      dp.discount_price,
      dp.category_id,
      s.name AS store_name,
      s.slug AS store_slug,
      COALESCE(s.is_platform, false) AS is_official,
      CASE
        WHEN v_tsquery IS NOT NULL THEN ts_rank_cd(dp.search_vector, v_tsquery)
        ELSE 0
      END AS rank
    FROM public.digital_products dp
    LEFT JOIN public.stores s ON s.id = dp.store_id
    WHERE dp.status = 'published'
      AND dp.moderation_status = 'approved'
      AND dp.deleted_at IS NULL
      AND (v_tsquery IS NULL OR dp.search_vector @@ v_tsquery)
      AND (v_category_id IS NULL OR dp.category_id = v_category_id)
      AND (v_store_id IS NULL OR dp.store_id = v_store_id)
    ORDER BY
      CASE WHEN v_tsquery IS NOT NULL THEN ts_rank_cd(dp.search_vector, v_tsquery) ELSE 0 END DESC,
      dp.created_at DESC
    LIMIT _limit
    OFFSET _offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_products_fts(text, text, text, int, int) TO anon, authenticated;
