-- ============================================================================
-- TOP-UP SALDO EBRISTORE via QRIS (SumoPod) — FONDASI
--
-- Tujuan: pengguna dapat mengisi saldo Ebrystore sendiri lewat pembayaran QRIS.
--         Uang masuk dicatat sebagai entri ledger append-only (source_type='topup').
--
-- Prinsip (anti-slop, mengikuti design-store-credit.md):
--   - Ledger append-only = sumber kebenaran; saldo = hasil hitung.
--   - Top-up TIDAK menumpang tabel `payments`/`orders` (payments.order_id NOT NULL,
--     settle_gateway_payment terikat order). Tabel sendiri: credit_topups.
--   - Nominal server-authoritative (RPC), bukan dari klien.
--   - Idempotency: satu top-up tidak boleh mengkredit dua kali (idempotency_key unik).
--   - Settle + kredit dalam SATU transaksi RPC.
--
-- Lingkungan: Supabase baru ini saja. JANGAN production sampai keputusan owner
--             soal regulasi uang elektronik (BI/OJK) — lihat O-05.
--
-- Rollback: DROP TABLE credit_topups; DROP FUNCTION create_credit_topup,
--           settle_credit_topup, next_topup_number, job_expire_topups;
--           DROP SEQUENCE topup_number_seq; restore CHECK source_type tanpa 'topup'.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Nomor top-up: TOP-YYYYMMDD-NNNNNN (pola sama dengan payment_number).
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.topup_number_seq;

CREATE OR REPLACE FUNCTION public.next_topup_number()
RETURNS text LANGUAGE sql SET search_path = public AS $$
  SELECT 'TOP-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.topup_number_seq')::text, 6, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_topup_number() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabel credit_topups — transaksi isi saldo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.credit_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_number text NOT NULL DEFAULT public.next_topup_number(),
  user_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'waiting_payment'
    CHECK (status IN ('waiting_payment','paid','expired','cancelled','failed')),
  provider text,
  provider_payment_id text,
  payment_url text,
  qr_reference text,
  paid_amount bigint CHECK (paid_amount IS NULL OR paid_amount > 0),
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topup_number)
);

CREATE INDEX IF NOT EXISTS idx_credit_topups_user
  ON public.credit_topups (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_topups_provider
  ON public.credit_topups (provider, provider_payment_id);

DROP TRIGGER IF EXISTS credit_topups_set_updated_at ON public.credit_topups;
CREATE TRIGGER credit_topups_set_updated_at
  BEFORE UPDATE ON public.credit_topups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.credit_topups TO authenticated;
GRANT ALL ON public.credit_topups TO service_role;

ALTER TABLE public.credit_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_topups_select_own ON public.credit_topups;
CREATE POLICY credit_topups_select_own ON public.credit_topups
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS credit_topups_select_staff ON public.credit_topups;
CREATE POLICY credit_topups_select_staff ON public.credit_topups
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'payments.view'));

-- ---------------------------------------------------------------------------
-- Perluas sumber ledger: refund | adjustment | reversal | topup.
-- Aditif: hanya menambah nilai yang diizinkan, tidak mengubah data lama.
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_source_type_check;
ALTER TABLE public.credit_ledger
  ADD CONSTRAINT credit_ledger_source_type_check
  CHECK (source_type IN ('refund','adjustment','reversal','topup'));

-- ---------------------------------------------------------------------------
-- Buat permintaan top-up. Nominal divalidasi server-side (batas 10rb - 1jt).
-- Idempoten TIDAK di sini (dibuat saat settle); pembuatan berulang = baris baru
-- dengan nomor berbeda, masing-masing menunggu pembayaran.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_credit_topup(_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.credit_topups;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _amount IS NULL OR _amount < 10000 THEN RAISE EXCEPTION 'AMOUNT_TOO_SMALL'; END IF;
  IF _amount > 1000000 THEN RAISE EXCEPTION 'AMOUNT_TOO_LARGE'; END IF;

  INSERT INTO public.credit_topups (user_id, amount, status, expires_at)
  VALUES (v_user, _amount, 'waiting_payment', now() + interval '1 hour')
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'topup_number', v_row.topup_number,
    'amount', v_row.amount,
    'status', v_row.status,
    'expires_at', v_row.expires_at
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.create_credit_topup(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_topup(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Simpan hasil pembuatan QRIS (dipanggil server-side dengan service role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_credit_topup_qris(
  _topup_id uuid,
  _provider text,
  _provider_payment_id text,
  _payment_url text,
  _qr_reference text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.credit_topups;
BEGIN
  UPDATE public.credit_topups
     SET provider = _provider,
         provider_payment_id = _provider_payment_id,
         payment_url = _payment_url,
         qr_reference = _qr_reference
   WHERE id = _topup_id
     AND status = 'waiting_payment'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND_OR_NOT_PENDING'; END IF;
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END; $$;
REVOKE EXECUTE ON FUNCTION public.attach_credit_topup_qris(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_credit_topup_qris(uuid,text,text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Selesaikan top-up: set paid + kredit ledger dalam SATU transaksi. Idempoten.
-- Hanya service role (dipanggil webhook / server fn setelah status provider valid).
-- ---------------------------------------------------------------------------
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
  IF _paid_amount IS NULL OR _paid_amount < t.amount THEN RAISE EXCEPTION 'AMOUNT_MISMATCH'; END IF;

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

-- ---------------------------------------------------------------------------
-- Kedaluwarsakan top-up yang melewati batas waktu. Tanpa mutasi ledger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_expire_topups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0;
BEGIN
  UPDATE public.credit_topups
     SET status = 'expired'
   WHERE status = 'waiting_payment'
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('expired', v_count);
END; $$;
REVOKE EXECUTE ON FUNCTION public.job_expire_topups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_expire_topups() TO service_role;

-- Jadwalkan expiry tiap 10 menit (pola sama dengan expire_orders).
DO $$
DECLARE j bigint;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'expire_topups' LOOP
    PERFORM cron.unschedule(j);
  END LOOP;
END $$;

SELECT cron.schedule('expire_topups', '*/10 * * * *', $job$SELECT public.job_expire_topups()$job$);
