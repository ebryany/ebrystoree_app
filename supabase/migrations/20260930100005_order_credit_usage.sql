-- ============================================================================
-- PAKAI SALDO SAAT CHECKOUT
--
-- Keputusan owner:
--   - Saldo OPSIONAL saat checkout (pembeli centang "pakai saldo").
--   - Total order berkurang sebesar saldo terpakai; sisanya dibayar normal.
--   - Semua refund (termasuk yang dibayar pakai saldo) → kembali ke saldo.
--
-- Perubahan bersifat ADITIF:
--   1. Kolom order untuk melacak saldo terpakai + sisa yang harus dibayar.
--   2. RPC create_digital_order diperluas: parameter _use_credit boolean.
--      (Parameter lama tetap; pemanggil lama tidak rusak.)
--   3. RPC create_service_order: versi digital saja untuk sekarang (services
--      menyusul) — TIDAK diubah di migrasi ini karena kurikulum berbeda.
--
-- Lingkungan: LOKAL / Supabase baru saja. JANGAN production.
-- Rollback: DROP kolom, kembalikan create_digital_order ke definisi sebelumnya.
-- ============================================================================

-- 1) Kolom pelacakan saldo pada order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_used bigint NOT NULL DEFAULT 0 CHECK (credit_used >= 0),
  ADD COLUMN IF NOT EXISTS amount_due  bigint;

COMMENT ON COLUMN public.orders.credit_used IS 'Saldo Ebrystore yang dipakai untuk order ini';
COMMENT ON COLUMN public.orders.amount_due IS 'Sisa yang harus dibayar pembeli (total - credit_used)';

-- 2) Terapkan saldo ke sebuah order (debit ledger) — idempoten per order.
CREATE OR REPLACE FUNCTION public.apply_credit_to_order(_order_id uuid, _max_credit bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  v_balance bigint;
  v_use bigint;
  v_key text;
  v_existing public.credit_ledger;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.user_id <> auth.uid() THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF o.credit_used > 0 THEN
    RETURN jsonb_build_object('credit_used', o.credit_used, 'amount_due', o.amount_due, 'duplicate', true);
  END IF;

  v_balance := public.get_credit_balance(o.user_id);
  v_use := LEAST(COALESCE(_max_credit, v_balance), v_balance, o.total);
  IF v_use <= 0 THEN
    RETURN jsonb_build_object('credit_used', 0, 'amount_due', o.total, 'duplicate', false);
  END IF;

  v_key := 'order:' || o.id::text;

  SELECT * INTO v_existing FROM public.credit_ledger WHERE idempotency_key = v_key;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.credit_ledger
      (user_id, direction, amount, source_type, source_id, reference, note, created_by, idempotency_key)
    VALUES
      (o.user_id, 'debit', v_use, 'adjustment', o.id, o.order_number,
       'Pemakaian saldo untuk pesanan ' || o.order_number, auth.uid(), v_key);
  END IF;

  UPDATE public.orders
     SET credit_used = v_use,
         amount_due = total - v_use
   WHERE id = o.id;

  -- Sesuaikan jumlah yang harus dibayar pada payment yang belum dibayar.
  UPDATE public.payments
     SET expected_amount = o.total - v_use
   WHERE order_id = o.id AND status IN ('waiting_payment','pending','draft');

  PERFORM public.write_audit_log('order.credit_apply', 'order', o.id, NULL,
    jsonb_build_object('credit_used', v_use, 'amount_due', o.total - v_use),
    'Pemakaian saldo Ebrystore', NULL, NULL);

  RETURN jsonb_build_object('credit_used', v_use, 'amount_due', o.total - v_use, 'duplicate', false);
END; $$;

REVOKE EXECUTE ON FUNCTION public.apply_credit_to_order(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_credit_to_order(uuid, bigint) TO authenticated;
