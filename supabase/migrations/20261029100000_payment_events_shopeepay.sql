-- ============================================================================
-- payment_events: metadata verifikasi untuk ShopeePay (dan provider lain)
--
-- Sifat: ADITIF. Hanya menambah kolom nullable dan indeks. Tidak mengubah atau
-- menghapus data lama. Kode aplikasi tetap berjalan sebelum migrasi ini
-- diterapkan (fallback ke kolom inti).
--
-- Deduplikasi tetap memakai UNIQUE (provider, external_event_id) yang sudah ada.
-- ============================================================================

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS amount bigint,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS provider_transaction_id text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS event_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_events_amount_nonneg'
  ) THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_amount_nonneg CHECK (amount IS NULL OR amount >= 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_events_provider_type
  ON public.payment_events (provider, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_events_provider_txn
  ON public.payment_events (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
