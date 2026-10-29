-- Perbaikan: settle_credit_topup gagal 'UNAUTHENTICATED' saat dipanggil service role
-- (webhook QRIS / verifikasi admin top up manual), karena get_credit_balance()
-- mewajibkan auth.uid(). Saldo kini dihitung langsung dari ledger di dalam fungsi.
-- Logika lain identik; alasan audit mengikuti provider (QRIS / transfer manual).
-- Rollback: terapkan ulang definisi dari 20261004100000_credit_topup.sql.

CREATE OR REPLACE FUNCTION public._ledger_balance(_user_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::bigint
    FROM public.credit_ledger
   WHERE user_id = _user_id;
$$;
REVOKE EXECUTE ON FUNCTION public._ledger_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ledger_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_credit_topup(
  _topup_id uuid,
  _provider text,
  _provider_ref text,
  _paid_amount bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.credit_topups;
  v_key text;
  v_balance bigint;
BEGIN
  SELECT * INTO t FROM public.credit_topups WHERE id = _topup_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF t.status = 'paid' THEN
    RETURN jsonb_build_object('status','already_settled','balance',
      public._ledger_balance(t.user_id));
  END IF;
  IF t.status <> 'waiting_payment' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  -- Nominal harus sama persis. Kelebihan/kekurangan = tidak diproses.
  IF _paid_amount IS NULL OR _paid_amount <> t.amount THEN RAISE EXCEPTION 'AMOUNT_MISMATCH'; END IF;

  v_key := 'topup:' || t.id::text;

  UPDATE public.credit_topups
     SET status = 'paid',
         provider = COALESCE(_provider, provider),
         provider_payment_id = COALESCE(_provider_ref, provider_payment_id),
         paid_amount = _paid_amount,
         paid_at = now()
   WHERE id = t.id;

  INSERT INTO public.credit_ledger
    (user_id, direction, amount, source_type, source_id, reference, note, idempotency_key)
  VALUES
    (t.user_id, 'credit', t.amount, 'topup', t.id, t.topup_number,
     'Isi saldo ' || t.topup_number, v_key)
  ON CONFLICT (idempotency_key) DO NOTHING;

  v_balance := public._ledger_balance(t.user_id);

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (t.user_id, 'credit_received', 'Saldo Ebrystore bertambah',
          'Isi saldo ' || t.topup_number || ' berhasil dan sudah masuk ke saldo Anda.',
          'credit_ledger', t.id);

  PERFORM public.write_audit_log('credit.topup', 'credit_topups', t.id, NULL,
    jsonb_build_object('amount', t.amount, 'balance', v_balance, 'provider', _provider),
    CASE WHEN _provider = 'manual' THEN 'Isi saldo via transfer manual' ELSE 'Isi saldo via QRIS' END,
    NULL, NULL);

  RETURN jsonb_build_object('status','credited','amount', t.amount, 'balance', v_balance);
END; $$;
REVOKE EXECUTE ON FUNCTION public.settle_credit_topup(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_credit_topup(uuid,text,text,bigint) TO service_role;
