-- ============================================================================
-- MARKETPLACE — PROMPT 21: Seller Earnings Ledger
--
-- Tujuan: mencatat pendapatan seller secara append-only (buku besar), sehingga
--         dashboard Keuangan punya DATA NYATA (bukan angka palsu).
--
-- Prinsip (AGENTS.md):
--   - Ledger append-only = sumber kebenaran. Saldo DIHITUNG, bukan kolom bebas.
--   - Idempotency: satu penjualan tidak boleh dikredit dua kali.
--   - Platform fee/komisi: BELUM diputuskan Owner (O-01) → fee = 0 dulu,
--     dicatat eksplisit agar bisa diisi kelak tanpa mengubah struktur.
--
-- Sifat: ADITIF. Lingkungan: LOKAL / Supabase baru.
-- Rollback: drop fungsi credit_seller_earnings, get_store_balance, tabel.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount bigint NOT NULL CHECK (amount > 0),       -- nilai bersih untuk seller
  gross_amount bigint NOT NULL DEFAULT 0,          -- nilai kotor penjualan
  platform_fee bigint NOT NULL DEFAULT 0,          -- komisi platform (0 sampai O-01)
  source_type text NOT NULL CHECK (source_type IN ('sale','refund','adjustment','reversal','payout')),
  source_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference text,
  note text,
  created_by uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_store ON public.seller_ledger (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_order ON public.seller_ledger (order_id);

GRANT SELECT ON public.seller_ledger TO authenticated;
GRANT ALL ON public.seller_ledger TO service_role;
ALTER TABLE public.seller_ledger ENABLE ROW LEVEL SECURITY;

-- Seller hanya melihat ledgernya sendiri.
DROP POLICY IF EXISTS seller_ledger_select_own ON public.seller_ledger;
CREATE POLICY seller_ledger_select_own ON public.seller_ledger
  FOR SELECT TO authenticated USING (store_id = public.my_store_id());

-- Staff dengan akses seller dapat melihat (audit).
DROP POLICY IF EXISTS seller_ledger_select_staff ON public.seller_ledger;
CREATE POLICY seller_ledger_select_staff ON public.seller_ledger
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'sellers.view'));

-- Saldo = hasil hitung ledger.
CREATE OR REPLACE FUNCTION public.get_store_balance(_store_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::bigint
  FROM public.seller_ledger WHERE store_id = _store_id;
$$;

CREATE OR REPLACE FUNCTION public.get_my_store_balance()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.my_store_id() IS NULL THEN 0 ELSE public.get_store_balance(public.my_store_id()) END;
$$;

-- Kredit pendapatan seller dari order yang sudah dibayar (idempoten per order).
CREATE OR REPLACE FUNCTION public.credit_seller_earnings(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_existing public.seller_ledger;
  r record;
  v_total bigint := 0;
  v_count int := 0;
BEGIN
  v_key := 'sale:' || _order_id::text;

  -- Idempotensi: bila sudah dikredit, jangan ulangi.
  SELECT * INTO v_existing FROM public.seller_ledger WHERE idempotency_key = v_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_credited','amount', v_existing.amount);
  END IF;

  -- Satu entri per store (order MVP = satu seller).
  FOR r IN
    SELECT oi.store_id, SUM(oi.total) AS gross, s.name AS store_name
      FROM public.order_items oi
      JOIN public.stores s ON s.id = oi.store_id
     WHERE oi.order_id = _order_id AND oi.store_id IS NOT NULL
     GROUP BY oi.store_id, s.name
  LOOP
    -- Fee platform = 0 untuk sekarang (menunggu keputusan O-01).
    INSERT INTO public.seller_ledger
      (store_id, direction, amount, gross_amount, platform_fee, source_type, order_id, reference, note, idempotency_key)
    VALUES
      (r.store_id, 'credit', r.gross, r.gross, 0, 'sale', _order_id,
       'ORDER:' || _order_id::text, 'Pendapatan penjualan ' || r.store_name,
       v_key || ':' || r.store_id::text);

    v_total := v_total + r.gross;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('status','credited','stores', v_count, 'amount', v_total);
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_store_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_balance(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_store_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_store_balance() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) TO service_role;
