-- ============================================================================
-- STORE CREDIT (Saldo Ebrystore) — FONDASI LEDGER
--
-- Tujuan: refund atas transaksi yang SUDAH DIBAYAR dapat dikembalikan sebagai
--         saldo Ebrystore (uang tetap di platform).
--
-- Prinsip (anti-slop):
--   - Ledger append-only = sumber kebenaran.
--   - Saldo = hasil hitung ledger (fungsi), BUKAN kolom yang diedit bebas.
--   - Idempotency: satu refund tidak boleh mengkredit dua kali.
--   - Koreksi via entri reversal baru, bukan edit/hapus.
--   - Setiap entri punya trail ke sumber uang nyata (source_type + source_id).
--
-- Lingkungan: LOKAL / Supabase baru saja. JANGAN production sampai keputusan
--             owner soal regulasi uang elektronik (BI/OJK).
--
-- Rollback: DROP FUNCTION credit_refund_to_balance, get_my_credit_balance,
--           get_credit_balance; DROP TABLE credit_ledger.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount bigint NOT NULL CHECK (amount > 0),
  source_type text NOT NULL CHECK (source_type IN ('refund','adjustment','reversal')),
  source_id uuid,
  reference text,
  note text,
  created_by uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON public.credit_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_source ON public.credit_ledger (source_type, source_id);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_ledger_select_own ON public.credit_ledger;
CREATE POLICY credit_ledger_select_own ON public.credit_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS credit_ledger_select_staff ON public.credit_ledger;
CREATE POLICY credit_ledger_select_staff ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'refunds.view'));

-- ---------------------------------------------------------------------------
-- Saldo = hasil hitung ledger (bukan kolom tersimpan).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_credit_balance(_user_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::bigint
  FROM public.credit_ledger
  WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_my_credit_balance()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_credit_balance(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Kredit saldo dari refund. Idempoten via idempotency_key.
-- Hanya boleh dipanggil oleh staff ber-permission refunds.process.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_refund_to_balance(_refund_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.refunds;
  v_key text;
  v_existing public.credit_ledger;
  v_balance bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(auth.uid(), 'refunds.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO r FROM public.refunds WHERE id = _refund_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- hanya refund yang sudah selesai boleh dikreditkan
  IF r.status <> 'completed' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  v_key := 'refund:' || r.id::text;

  SELECT * INTO v_existing FROM public.credit_ledger WHERE idempotency_key = v_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_credited','balance',
      public.get_credit_balance(r.customer_id));
  END IF;

  INSERT INTO public.credit_ledger
    (user_id, direction, amount, source_type, source_id, reference, note, created_by, idempotency_key)
  VALUES
    (r.customer_id, 'credit', r.amount, 'refund', r.id, r.refund_number,
     'Saldo dari refund ' || r.refund_number, auth.uid(), v_key);

  v_balance := public.get_credit_balance(r.customer_id);

  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (r.customer_id, 'credit_received', 'Saldo Ebrystore bertambah',
          'Refund ' || r.refund_number || ' telah masuk sebagai saldo Ebrystore Anda.', 'credit_ledger', r.id);

  PERFORM public.write_audit_log('credit.refund', 'credit_ledger', r.id,
    NULL, jsonb_build_object('amount', r.amount, 'balance', v_balance), 'Kredit saldo dari refund', NULL, NULL);

  RETURN jsonb_build_object('status','credited','amount', r.amount, 'balance', v_balance);
END; $$;

REVOKE EXECUTE ON FUNCTION public.credit_refund_to_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_refund_to_balance(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_credit_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_credit_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_credit_balance() TO authenticated;
