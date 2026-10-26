-- ============================================================================
-- PERBAIKAN AUDIT — Payment & Data Integrity (bagian 3 dari 3)
--
-- Menutup:
--   BL-003   settle_credit_topup menerima kelebihan tanpa mencatat selisih
--   SELLER-BL-004  user_roles tanpa FK ke auth.users (role yatim)
--
-- Sifat: ADITIF. Untuk FK, data yatim dibersihkan lebih dulu agar constraint
-- bisa dipasang tanpa gagal.
-- ============================================================================

-- 1) TOPUP: TOLAK NOMINAL TIDAK SAMA ---------------------------------------
-- Sebelumnya hanya menolak kurang (<). Kelebihan diterima diam-diam.
-- Sekarang wajib sama persis; selisih bukan hal yang boleh diabaikan pada
-- kredit saldo.
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
      public.get_credit_balance(t.user_id));
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

  v_balance := public.get_credit_balance(t.user_id);

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (t.user_id, 'credit_received', 'Saldo Ebrystore bertambah',
          'Isi saldo ' || t.topup_number || ' berhasil dan sudah masuk ke saldo Anda.',
          'credit_ledger', t.id);

  PERFORM public.write_audit_log('credit.topup', 'credit_topups', t.id, NULL,
    jsonb_build_object('amount', t.amount, 'balance', v_balance, 'provider', _provider),
    'Isi saldo via QRIS', NULL, NULL);

  RETURN jsonb_build_object('status','credited','amount', t.amount, 'balance', v_balance);
END; $$;

REVOKE EXECUTE ON FUNCTION public.settle_credit_topup(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_credit_topup(uuid,text,text,bigint) TO service_role;

-- 2) BERSIHKAN ROLE YATIM, LALU PASANG FK ----------------------------------
-- Role milik user yang sudah tidak ada di auth.users tidak memberi akses
-- (user tidak bisa login), tetapi membuat laporan dan audit tidak akurat.
DELETE FROM public.user_roles ur
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ur.user_id);

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
