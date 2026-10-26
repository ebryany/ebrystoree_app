-- ============================================================================
-- PERBAIKAN: sold_count tidak pernah naik saat order digital lunas.
--
-- Temuan (riset 2026-10-04):
--   - Toko citra punya 3 order item digital berstatus paid/completed, tetapi
--     sold_count semua produknya 0. Halaman toko menampilkan rating 5.0
--     (1 ulasan) berdampingan dengan "Belum ada penjualan" — dua angka yang
--     saling bertentangan.
--   - Akar masalah: tidak ada satu pun trigger/RPC yang menaikkan sold_count.
--     Migrasi 20261004091000/20261004093000 mengunci kolom itu dari seller
--     (benar, anti manipulasi) tetapi tidak menyediakan jalur resmi kenaikannya.
--
-- Perbaikan (aditif):
--   1. RPC sync_product_sold_counts() yang menghitung ulang sold_count dari
--      order_items yang benar-benar lunas (paid/completed), idempoten.
--   2. Trigger pada order_items: saat item digital masuk status lunas, panggil
--      sinkronisasi untuk produk terkait.
--   3. Backfill satu kali untuk data lama.
--
-- Definisi "terjual" yang dipakai: jumlah unit pada order_items digital yang
-- order-nya berstatus paid atau completed. Ini konsisten dengan cara halaman
-- toko menghitung "terjual" (SUM sold_count), dan tidak menghitung order yang
-- dibatalkan/refund (status berubah keluar dari daftar itu → ikut turun).
--
-- Rollback: DROP TRIGGER order_items_sync_sold_count ON public.order_items;
--           DROP FUNCTION sync_product_sold_counts(uuid);
--           DROP FUNCTION trg_sync_sold_count_on_order_item();
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Hitung ulang sold_count satu produk dari transaksi lunas. Idempoten.
-- SECURITY DEFINER: berjalan dari trigger order_items yang dibuat pembeli,
-- sehingga tidak boleh bergantung pada izin tulis pembeli ke digital_products.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_product_sold_counts(_product_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sold bigint;
BEGIN
  IF _product_id IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(oi.quantity), 0) INTO v_sold
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = _product_id
    AND oi.item_type = 'digital_product'
    AND o.status IN ('paid', 'completed');

  UPDATE public.digital_products
     SET sold_count = v_sold
   WHERE id = _product_id
     AND sold_count IS DISTINCT FROM v_sold;

  RETURN v_sold;
END; $$;

REVOKE EXECUTE ON FUNCTION public.sync_product_sold_counts(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: setiap perubahan pada order_items (termasuk saat order berubah
-- status dan menyentuh item) menyinkronkan produk terkait.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_sold_count_on_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.sync_product_sold_counts(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.sync_product_sold_counts(NEW.product_id);
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM public.sync_product_sold_counts(OLD.product_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS order_items_sync_sold_count ON public.order_items;
CREATE TRIGGER order_items_sync_sold_count
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_sold_count_on_order_item();

-- ---------------------------------------------------------------------------
-- Status order berubah (mis. awaiting_payment -> paid) tanpa menyentuh
-- order_items, jadi item tidak ikut ter-trigger. Trigger pada orders menutup
-- celah itu dengan menyinkronkan seluruh produk dalam order tersebut.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sync_sold_count_on_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_product uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  FOR v_product IN
    SELECT DISTINCT product_id FROM public.order_items
     WHERE order_id = NEW.id AND product_id IS NOT NULL
  LOOP
    PERFORM public.sync_product_sold_counts(v_product);
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_sync_sold_count ON public.orders;
CREATE TRIGGER orders_sync_sold_count
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_sold_count_on_order();

-- ---------------------------------------------------------------------------
-- Backfill: perbaiki angka lama yang tertinggal nol.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_product uuid;
BEGIN
  FOR v_product IN SELECT DISTINCT product_id FROM public.order_items WHERE product_id IS NOT NULL LOOP
    PERFORM public.sync_product_sold_counts(v_product);
  END LOOP;
END $$;
