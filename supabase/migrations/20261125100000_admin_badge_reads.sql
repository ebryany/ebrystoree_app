-- ============================================================================
-- Admin Sidebar Badge Read Tracking (Per-Admin Seen Timestamps)
-- ============================================================================
-- Tujuan:
--   Menyimpan waktu terakhir (`seen_at`) setiap akun admin membuka masing-masing
--   halaman menu sidebar yang memiliki badge notifikasi/antrean.
--   - Begitu admin mengklik/membuka halaman menu, badge merah langsung hilang
--     dan tetap hilang setelah refresh maupun di perangkat lain.
--   - Badge hanya muncul lagi apabila ada item/notifikasi BARU dengan timestamp
--     lebih baru dari `seen_at`.
-- Keamanan:
--   - Isolasi per user via RLS (`user_id = auth.uid()`).
--   - Penulisan hanya lewat RPC SECURITY DEFINER `mark_admin_badge_seen` yang
--     memeriksa izin `admin.dashboard.view` / `is_super_admin` dan daftar key valid.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_badge_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key text NOT NULL CHECK (
    badge_key IN (
      'sellers',
      'productModeration',
      'serviceModeration',
      'orders',
      'chats',
      'payments',
      'topups',
      'refunds',
      'payouts',
      'tasks',
      'fulfillment',
      'po',
      'security'
    )
  ),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_badge_reads_user
  ON public.admin_badge_reads (user_id);

ALTER TABLE public.admin_badge_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_badge_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_badge_reads TO authenticated;
GRANT ALL ON TABLE public.admin_badge_reads TO service_role;

DROP POLICY IF EXISTS admin_badge_reads_select_own ON public.admin_badge_reads;
CREATE POLICY admin_badge_reads_select_own
  ON public.admin_badge_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.mark_admin_badge_seen(_badge_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_seen_at timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT (
    public.has_permission(v_user, 'admin.dashboard.view')
    OR public.is_super_admin(v_user)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _badge_key IS NULL OR _badge_key NOT IN (
    'sellers',
    'productModeration',
    'serviceModeration',
    'orders',
    'chats',
    'payments',
    'topups',
    'refunds',
    'payouts',
    'tasks',
    'fulfillment',
    'po',
    'security'
  ) THEN
    RAISE EXCEPTION 'INVALID_BADGE_KEY';
  END IF;

  INSERT INTO public.admin_badge_reads (user_id, badge_key, seen_at)
  VALUES (v_user, _badge_key, now())
  ON CONFLICT (user_id, badge_key) DO UPDATE
    SET seen_at = GREATEST(public.admin_badge_reads.seen_at, now())
  RETURNING seen_at INTO v_seen_at;

  RETURN jsonb_build_object(
    'ok', true,
    'badge_key', _badge_key,
    'seen_at', v_seen_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_admin_badge_seen(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_admin_badge_seen(text) TO authenticated;
