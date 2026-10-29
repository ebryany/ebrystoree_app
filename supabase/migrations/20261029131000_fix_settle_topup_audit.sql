-- Lanjutan 20261029130000: write_audit_log() juga mewajibkan auth.uid(), sehingga
-- settle via service role tetap gagal. Audit kini ditulis langsung ke audit_logs
-- (pola sama dengan settle_gateway_payment). Aktor = admin peninjau (reviewed_by)
-- untuk top up manual, atau NULL/'system' untuk webhook QRIS.
-- Rollback: terapkan ulang definisi dari 20261029130000.

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
  v_actor uuid;
  v_role text;
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

  -- Aktor: sesi login bila ada, lalu admin peninjau top up manual, selain itu sistem.
  v_actor := COALESCE(auth.uid(), t.reviewed_by);
  IF v_actor IS NOT NULL THEN
    SELECT string_agg(role::text, ',' ORDER BY role::text) INTO v_role
      FROM public.user_roles WHERE user_id = v_actor;
  END IF;

  INSERT INTO public.audit_logs
    (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES
    (v_actor, COALESCE(v_role, 'system'), 'credit.topup', 'credit_topups', t.id,
     jsonb_build_object('status', t.status),
     jsonb_build_object('status', 'paid', 'amount', t.amount, 'balance', v_balance,
                        'provider', _provider, 'user_id', t.user_id),
     CASE WHEN _provider = 'manual' THEN 'Isi saldo via transfer manual' ELSE 'Isi saldo via QRIS' END);

  RETURN jsonb_build_object('status','credited','amount', t.amount, 'balance', v_balance);
END; $$;
REVOKE EXECUTE ON FUNCTION public.settle_credit_topup(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_credit_topup(uuid,text,text,bigint) TO service_role;
