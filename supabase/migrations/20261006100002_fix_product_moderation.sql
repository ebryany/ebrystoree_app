-- ============================================================================
-- PERBAIKAN AUDIT — Product Moderation & Catalog Visibility (bagian 2 dari 3)
--
-- Menutup:
--   PRODUCT-BL-001  edit produk approved tidak memicu moderasi ulang
--   PRODUCT-BL-002  produk toko suspended tampil publik
--   PRODUCT-BL-003  produk bisa diedit saat pending
--
-- Sifat: ADITIF. Tidak mengubah skema.
-- ============================================================================

-- 1) HELPER: apakah toko boleh tampil publik? ---------------------------------
-- SECURITY DEFINER agar policy produk tidak bergantung pada RLS `stores`
-- (menghindari subquery yang rapuh bila policy stores berubah).
CREATE OR REPLACE FUNCTION public.store_is_publicly_visible(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.status = 'active' FROM public.stores s WHERE s.id = _store_id),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.store_is_publicly_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_is_publicly_visible(uuid) TO anon, authenticated;

-- 2) RESET MODERASI SAAT KONTEN YANG DIREVIEW BERUBAH -----------------------
CREATE OR REPLACE FUNCTION public.protect_moderation_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_content_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.moderation_status := 'pending';
    NEW.moderation_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.sold_count := 0;
    RETURN NEW;
  END IF;

  -- Kolom moderasi tidak boleh diubah seller.
  IF NEW.moderation_status = 'approved' AND OLD.moderation_status IS DISTINCT FROM 'approved' THEN
    NEW.moderation_status := OLD.moderation_status;
  END IF;
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
     AND NEW.moderation_status NOT IN ('pending','rejected') THEN
    NEW.moderation_status := OLD.moderation_status;
  END IF;
  NEW.moderation_note := CASE WHEN NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
                              THEN NEW.moderation_note ELSE OLD.moderation_note END;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;

  -- PRODUCT-BL-001: konten berubah pada produk approved -> wajib moderasi ulang.
  IF OLD.moderation_status = 'approved' THEN
    v_content_changed :=
         NEW.name IS DISTINCT FROM OLD.name
      OR NEW.short_description IS DISTINCT FROM OLD.short_description
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
      OR NEW.price IS DISTINCT FROM OLD.price
      OR NEW.discount_price IS DISTINCT FROM OLD.discount_price;

    IF v_content_changed THEN
      NEW.moderation_status := 'pending';
      NEW.moderation_note := NULL;
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      -- Produk tidak boleh tetap tayang dengan konten yang belum direview.
      IF NEW.status = 'published' THEN
        NEW.status := 'draft';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS products_protect_moderation ON public.digital_products;
CREATE TRIGGER products_protect_moderation
BEFORE INSERT OR UPDATE ON public.digital_products
FOR EACH ROW EXECUTE FUNCTION public.protect_moderation_fields();

-- 3) POLICY PUBLIK: SEMBUNYIKAN PRODUK DARI TOKO TIDAK AKTIF ----------------
DROP POLICY IF EXISTS products_select_public ON public.digital_products;
CREATE POLICY products_select_public ON public.digital_products
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND deleted_at IS NULL
    AND moderation_status = 'approved'
    AND (store_id IS NULL OR public.store_is_publicly_visible(store_id))
  );
