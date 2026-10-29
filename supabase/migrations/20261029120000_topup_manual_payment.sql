-- Top-up saldo via metode pembayaran custom (transfer bank / e-wallet manual).
-- Aditif: kolom bukti transfer + job expiry tidak mengedaluwarsakan top-up yang
-- sudah mengirim bukti (menunggu verifikasi admin).
-- Rollback: DROP COLUMN proof_*, method_snapshot; kembalikan job_expire_topups lama.

ALTER TABLE public.credit_topups
  ADD COLUMN IF NOT EXISTS method_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS proof_path text,
  ADD COLUMN IF NOT EXISTS proof_sender_name text,
  ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS idx_credit_topups_manual_pending
  ON public.credit_topups (proof_submitted_at)
  WHERE provider = 'manual' AND status = 'waiting_payment';

CREATE OR REPLACE FUNCTION public.job_expire_topups()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0;
BEGIN
  UPDATE public.credit_topups
     SET status = 'expired'
   WHERE status = 'waiting_payment'
     AND proof_submitted_at IS NULL
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('expired', v_count);
END; $$;
REVOKE EXECUTE ON FUNCTION public.job_expire_topups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_expire_topups() TO service_role;
