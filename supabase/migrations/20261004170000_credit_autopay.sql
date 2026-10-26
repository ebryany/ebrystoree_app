-- ============================================================================
-- LUNAS OTOMATIS SAAT SALDO MENUTUP SELURUH TAGIHAN
--
-- Temuan (audit 2026-10-04): bila pembeli memakai saldo sampai `amount_due` = 0,
-- order tetap berstatus `awaiting_payment` dan payment `waiting_payment` dengan
-- `expected_amount` 0. Pembeli tidak punya cara menyelesaikannya: QRIS tidak
-- masuk akal untuk tagihan nol, transfer manual juga tidak. Order nyangkut
-- sampai ada yang memanggil settle secara manual.
--
-- Perbaikan (aditif): di akhir `apply_credit_to_order`, bila sisa tagihan nol,
-- selesaikan pembayaran lewat jalur yang sama dengan pembayaran lain
-- (`settle_gateway_payment`) sehingga semua efek sampingnya konsisten:
-- entitlement terbit, invoice lunas, riwayat status, notifikasi, dan audit.
--
-- Rollback: kembalikan definisi apply_credit_to_order ke versi sebelumnya
--           (lihat migrasi 20260930100005_order_credit_usage.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_credit_to_order(_order_id uuid, _max_credit bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders;
  v_balance bigint;
  v_use bigint;
  v_key text;
  v_existing public.credit_ledger;
  v_due bigint;
  v_payment_id uuid;
  v_settled jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF o.user_id <> auth.uid() THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Idempotensi lebih dulu daripada validasi status: bila saldo sudah pernah
  -- dipakai untuk order ini, panggilan ulang mengembalikan hasil yang sama.
  -- Penting karena order yang lunas lewat saldo langsung berstatus 'paid',
  -- sehingga tanpa cabang ini panggilan ulang akan ditolak INVALID_STATE.
  IF o.credit_used > 0 THEN
    RETURN jsonb_build_object('credit_used', o.credit_used, 'amount_due', o.amount_due,
      'duplicate', true, 'settled', o.status IN ('paid','completed'));
  END IF;

  IF o.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  -- H-3: kunci transaksi per-user SEBELUM baca saldo. Bentuk dua-argumen dengan
  -- class 710003 terpisah dari keyspace hashtext() satu-argumen milik
  -- check_rate_limit, jadi tidak mungkin kolisi. Tanpa ini, dua order berbeda
  -- milik user yang sama membaca saldo bersamaan dan sama-sama berhasil debit.
  PERFORM pg_advisory_xact_lock(710003, hashtext(o.user_id::text));

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

  v_due := o.total - v_use;

  UPDATE public.orders
     SET credit_used = v_use,
         amount_due = v_due
   WHERE id = o.id;

  -- Sesuaikan jumlah yang harus dibayar pada payment yang belum dibayar.
  UPDATE public.payments
     SET expected_amount = v_due
   WHERE order_id = o.id AND status IN ('waiting_payment','pending','draft');

  -- Bila saldo menutup SELURUH tagihan, tidak ada yang perlu dibayar lagi:
  -- selesaikan lewat jalur settle yang sama supaya entitlement, invoice,
  -- notifikasi, dan audit tetap konsisten dengan pembayaran lain.
  IF v_due = 0 THEN
    SELECT id INTO v_payment_id FROM public.payments
     WHERE order_id = o.id AND status IN ('waiting_payment','pending','draft')
     ORDER BY created_at LIMIT 1;

    IF v_payment_id IS NOT NULL THEN
      v_settled := public.settle_gateway_payment(
        v_payment_id, 'credit', 'SALDO:' || o.order_number, 0, 'credit');
      IF (v_settled->>'payment_status') <> 'paid' THEN
        RAISE EXCEPTION 'CREDIT_SETTLE_FAILED';
      END IF;
    END IF;
  END IF;

  PERFORM public.write_audit_log('order.credit_apply', 'order', o.id, NULL,
    jsonb_build_object('credit_used', v_use, 'amount_due', v_due, 'settled_with_credit', v_due = 0),
    'Pemakaian saldo Ebrystore', NULL, NULL);

  RETURN jsonb_build_object('credit_used', v_use, 'amount_due', v_due, 'duplicate', false,
    'settled', v_due = 0);
END; $$;
