-- ============================================================================
-- MARKETPLACE — PROMPT 15: Inventory Per Seller
--
-- Tujuan: seller bisa melihat ringkasan stok produk mereka, dan mengetahui
--         produk mana yang stoknya rendah atau habis.
--
-- Sifat: ADITIF. RPC baru, tidak mengubah tabel existing.
-- Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop functions di bawah ini.
-- ============================================================================

-- 1) RPC: ringkasan inventori seller ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_inventory_summary()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_store_id uuid;
  v_total int;
  v_out_of_stock int;
  v_low_stock int;
  v_threshold int := 5;
BEGIN
  SELECT my_store_id() INTO v_store_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'NO_STORE';
  END IF;

  SELECT count(*)
    INTO v_total
    FROM public.digital_products
   WHERE store_id = v_store_id
     AND deleted_at IS NULL;

  SELECT count(*)
    INTO v_out_of_stock
    FROM public.digital_products
   WHERE store_id = v_store_id
     AND deleted_at IS NULL
     AND delivery_mode IN ('unique', 'code')
     AND available_stock = 0;

  SELECT count(*)
    INTO v_low_stock
    FROM public.digital_products
   WHERE store_id = v_store_id
     AND deleted_at IS NULL
     AND delivery_mode IN ('unique', 'code')
     AND available_stock > 0
     AND available_stock <= v_threshold;

  RETURN jsonb_build_object(
    'total_products', v_total,
    'out_of_stock', v_out_of_stock,
    'low_stock', v_low_stock,
    'threshold', v_threshold
  );
END;
$$;

-- 2) RPC: daftar produk stok rendah/habis seller ------------------------------
CREATE OR REPLACE FUNCTION public.get_my_low_stock_products(_limit int DEFAULT 20)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  delivery_mode text,
  available_stock int,
  moderation_status text,
  status text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_store_id uuid;
  v_threshold int := 5;
BEGIN
  SELECT my_store_id() INTO v_store_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'NO_STORE';
  END IF;

  RETURN QUERY
    SELECT dp.id, dp.name, dp.delivery_mode, dp.available_stock,
           dp.moderation_status, dp.status
      FROM public.digital_products dp
     WHERE dp.store_id = v_store_id
       AND dp.deleted_at IS NULL
       AND dp.delivery_mode IN ('unique', 'code')
       AND dp.available_stock <= v_threshold
     ORDER BY dp.available_stock ASC, dp.name ASC
     LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_inventory_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_low_stock_products(int) TO authenticated;
