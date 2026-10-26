-- ============================================================================
-- EMAIL TRANSAKSIONAL — LOG IDEMPOTEN + PREFERENSI PENGGUNA
--
-- Tujuan: notifikasi email saat transaksi selesai / status pesanan berubah.
--
-- Prinsip:
--   - Satu event = maksimal satu email (UNIQUE recipient + event + entity).
--   - Kegagalan email TIDAK membatalkan transaksi; status dicatat untuk kirim ulang.
--   - Pengguna bisa mematikan email (preferensi).
--
-- Rollback: DROP TABLE email_dispatch_log;
--           ALTER TABLE profiles DROP COLUMN email_notifications_enabled;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  recipient_email text NOT NULL,
  event text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  template text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Kunci idempotensi: satu penerima tidak menerima event yang sama untuk
  -- entitas yang sama dua kali.
  UNIQUE (recipient_id, event, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_email_dispatch_status
  ON public.email_dispatch_log (status, created_at)
  WHERE status IN ('pending','failed');

CREATE INDEX IF NOT EXISTS idx_email_dispatch_recipient
  ON public.email_dispatch_log (recipient_id, created_at DESC);

DROP TRIGGER IF EXISTS email_dispatch_set_updated_at ON public.email_dispatch_log;
CREATE TRIGGER email_dispatch_set_updated_at
  BEFORE UPDATE ON public.email_dispatch_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hanya service role yang menyentuh tabel ini; pengguna tidak perlu membacanya
-- (riwayat email mereka terlihat di kotak masuk email, bukan di aplikasi).
ALTER TABLE public.email_dispatch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_dispatch_select_staff ON public.email_dispatch_log;
CREATE POLICY email_dispatch_select_staff ON public.email_dispatch_log
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'orders.view'));

GRANT SELECT ON public.email_dispatch_log TO authenticated;
GRANT ALL ON public.email_dispatch_log TO service_role;

-- ---------------------------------------------------------------------------
-- Preferensi: pengguna boleh mematikan email transaksional.
-- Default true supaya pembeli tetap dapat kabar transaksi sampai mereka
-- memilih sebaliknya.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT true;
