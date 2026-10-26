-- ============================================================================
-- SELLER WITHDRAWAL SYSTEM — tarik saldo manual, fee 15%, finance approval
--
-- Tujuan: seller dapat mengajukan penarikan saldo tersedia (min Rp5.000, fee
--         15% di-snapshot saat pengajuan), finance memproses transfer bank
--         manual dengan alur persetujuan yang dapat diaudit.
--
-- Prinsip (mengikuti seller_earnings_ledger + design-store-credit):
--   - Ledger append-only tetap satu-satunya sumber kebenaran saldo. Tidak ada
--     kolom saldo baru. Reservasi penarikan = entri debit source_type='payout'
--     (slot enum yang memang sudah disiapkan sejak awal), pembatalan/penolakan
--     = entri kredit 'reversal'. Karena saldo DIHITUNG, available_balance turun
--     otomatis saat reservasi dan pulih saat pembatalan.
--   - Fee di-snapshot di baris withdrawal (fee_bps + fee_amount) dengan CHECK
--     immutable, sehingga perubahan setting tidak pernah menyentuh pengajuan
--     yang sudah ada.
--   - Reservasi atomik: pg_advisory_xact_lock per-store (class 710006, keyspace
--     terpisah dari 710003 kredit pembeli & 710004 checkout) SEBELUM saldo
--     dibaca, lalu validasi + insert withdrawal + insert ledger dalam SATU
--     transaksi RPC. Dua pengajuan paralel tidak bisa memakai saldo yang sama.
--   - Transfer manual tidak pernah diotomatisasi. Status transfer tak pasti
--     masuk needs_reconciliation dan hanya diselesaikan lewat keputusan
--     finance yang berwenang + audit.
--   - Feature gate feature_manual_payout default MATI: pencairan uang nyata
--     baru boleh aktif setelah legal/operational readiness disetujui Owner.
--
-- Keputusan Owner yang menjadi dasar (master prompt 2026-10-27):
--   minimum_withdrawal_gross = 5000 (menimpa nilai lama 50000 pada key
--   existing marketplace_min_payout — tidak membuat key kedua),
--   withdrawal fee = 1500 basis poin (15%), payout = transfer bank manual.
--
-- Rollback: DROP TABLE withdrawal_events, withdrawals, seller_bank_accounts;
--   DROP FUNCTION request_withdrawal, cancel_own_withdrawal, review_withdrawal,
--   record_withdrawal_transfer, complete_withdrawal,
--   mark_withdrawal_reconciliation, resolve_withdrawal_reconciliation,
--   save_seller_bank_account, get_my_withdrawal_policy, notify_payout_staff,
--   next_withdrawal_number; DROP SEQUENCE withdrawal_number_seq;
--   DELETE permissions/role_payments payouts.*; (entri ledger payout/ledger
--   reversal TIDAK dihapus — ledger append-only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Permissions payout untuk finance/admin
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('payouts.view',    'Transaksi', 'Melihat antrean payout/penarikan seller', true),
  ('payouts.approve', 'Transaksi', 'Menyetujui atau menolak pengajuan penarikan', true),
  ('payouts.process', 'Transaksi', 'Mencatat transfer manual dan menyelesaikan payout', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('finance','payouts.view'),
  ('finance','payouts.approve'),
  ('finance','payouts.process'),
  ('admin','payouts.view'),
  ('admin','payouts.approve'),
  ('admin','payouts.process')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Kebijakan: minimum penarikan Rp5.000 pada key existing, fee 1500 bps
-- ---------------------------------------------------------------------------
-- Kebijakan baru: minimum penarikan bruto Rp5.000. Barisnya bisa belum ada di
-- system_settings (default registry tidak otomatis tersimpan), jadi pakai upsert.
-- Nilai yang sudah dikustomisasi Owner (≠ 50000) dihormati.
INSERT INTO public.system_settings (key, value, description, is_public)
VALUES ('marketplace_min_payout', '5000'::jsonb,
        'Minimum nominal penarikan bruto (Rp). Juga menjadi syarat minimum saldo tersedia.', true)
ON CONFLICT (key) DO UPDATE
  SET value = '5000'::jsonb,
      description = EXCLUDED.description
 WHERE public.system_settings.value #>> '{}' = '50000';

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES ('marketplace_withdrawal_fee_bps', '1500'::jsonb,
        'Fee penarikan saldo dalam basis poin (1500 = 15% dari nominal bruto).', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES ('feature_manual_payout', 'false'::jsonb,
        'Saklar payout manual seller. Harus tetap mati sampai legal & operational readiness disetujui.', false)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Nomor dokumen: WDR-YYYYMMDD-NNNNNN (pola TOP-/PAY-)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.withdrawal_number_seq;

CREATE OR REPLACE FUNCTION public.next_withdrawal_number()
RETURNS text LANGUAGE sql SET search_path = public AS $$
  SELECT 'WDR-' || to_char(now() AT TIME ZONE 'Asia/Makassar','YYYYMMDD') || '-' ||
         lpad(nextval('public.withdrawal_number_seq')::text, 6, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_withdrawal_number() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Rekening bank seller — satu rekening aktif per toko, diubah hanya via RPC
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  bank_name text NOT NULL CHECK (length(btrim(bank_name)) BETWEEN 2 AND 60),
  account_number text NOT NULL CHECK (regexp_replace(btrim(account_number), '[ -]', '', 'g') ~ '^[0-9]{6,25}$'),
  account_holder_name text NOT NULL CHECK (length(btrim(account_holder_name)) BETWEEN 2 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seller_bank_accounts TO authenticated;
GRANT ALL ON public.seller_bank_accounts TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.seller_bank_accounts FROM authenticated, anon;
ALTER TABLE public.seller_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_bank_select_own ON public.seller_bank_accounts;
CREATE POLICY seller_bank_select_own ON public.seller_bank_accounts
  FOR SELECT TO authenticated USING (store_id = public.my_store_id());

DROP POLICY IF EXISTS seller_bank_select_staff ON public.seller_bank_accounts;
CREATE POLICY seller_bank_select_staff ON public.seller_bank_accounts
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'payouts.view'));

-- Tidak ada policy INSERT/UPDATE/DELETE untuk authenticated: perubahan rekening
-- hanya lewat save_seller_bank_account (SECURITY DEFINER + audit).

-- ---------------------------------------------------------------------------
-- 5. withdrawals — pengajuan penarikan + snapshot fee & rekening tujuan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_number text NOT NULL UNIQUE DEFAULT public.next_withdrawal_number(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  gross_amount bigint NOT NULL CHECK (gross_amount > 0),
  fee_bps integer NOT NULL CHECK (fee_bps BETWEEN 0 AND 5000),
  fee_amount bigint NOT NULL CHECK (fee_amount >= 0),
  net_amount bigint NOT NULL CHECK (net_amount > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','approved','transferred','completed','rejected','cancelled','needs_reconciliation')),
  -- snapshot rekening tujuan: perubahan rekening belakangan tidak mengubah tujuan
  bank_name text NOT NULL CHECK (length(btrim(bank_name)) BETWEEN 2 AND 60),
  bank_account_number text NOT NULL CHECK (regexp_replace(btrim(bank_account_number), '[ -]', '', 'g') ~ '^[0-9]{6,25}$'),
  bank_account_holder text NOT NULL CHECK (length(btrim(bank_account_holder)) BETWEEN 2 AND 100),
  bank_reference text CHECK (bank_reference IS NULL OR length(btrim(bank_reference)) BETWEEN 3 AND 100),
  decision_note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  transfer_note text,
  transferred_by uuid REFERENCES auth.users(id),
  transferred_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- invariants uang immutable: fee selalu hasil pembulatan half-up dari bps,
  -- net selalu bruto dikurangi fee. CHECK tidak boleh membaca system_settings
  -- (pola marketplace_settings_binding), jadi rentang bps dikunci keras di sini.
  CHECK (fee_amount = (gross_amount * fee_bps + 5000) / 10000),
  CHECK (net_amount = gross_amount - fee_amount)
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_store ON public.withdrawals (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_by ON public.withdrawals (requested_by);

GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawals FROM authenticated, anon;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS withdrawals_select_own ON public.withdrawals;
CREATE POLICY withdrawals_select_own ON public.withdrawals
  FOR SELECT TO authenticated USING (store_id = public.my_store_id());

DROP POLICY IF EXISTS withdrawals_select_staff ON public.withdrawals;
CREATE POLICY withdrawals_select_staff ON public.withdrawals
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'payouts.view'));

-- ---------------------------------------------------------------------------
-- 6. withdrawal_events — timeline audit per pengajuan (untuk UI & rekonsiliasi)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.withdrawal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.withdrawals(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN
    ('requested','approved','rejected','cancelled','transferred','completed',
     'reconciliation_opened','reconciliation_resolved')),
  actor_id uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_events_withdrawal
  ON public.withdrawal_events (withdrawal_id, created_at);

GRANT SELECT ON public.withdrawal_events TO authenticated;
GRANT ALL ON public.withdrawal_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawal_events FROM authenticated, anon;
ALTER TABLE public.withdrawal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS withdrawal_events_select ON public.withdrawal_events;
CREATE POLICY withdrawal_events_select ON public.withdrawal_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.withdrawals w
       WHERE w.id = withdrawal_id
         AND (w.store_id = public.my_store_id()
              OR public.has_permission(auth.uid(), 'payouts.view'))
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Helper notifikasi finance/admin (pola notify_payment_staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_payout_staff(_type text, _title text, _msg text, _related_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  SELECT DISTINCT ur.user_id, _type, _title, _msg, 'payout', _related_id
  FROM public.user_roles ur WHERE ur.role IN ('finance','admin','super_admin');
$$;
REVOKE EXECUTE ON FUNCTION public.notify_payout_staff(text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Kebijakan aktif untuk UI seller (satu panggilan untuk form + preview)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_withdrawal_policy()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store uuid;
  v_bank record;
  v_feature boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('has_store', false, 'feature_enabled', false);
  END IF;
  v_feature := COALESCE(
    (SELECT value FROM public.system_settings WHERE key = 'feature_manual_payout'),
    'false'::jsonb) = 'true'::jsonb;
  SELECT * INTO v_bank FROM public.seller_bank_accounts WHERE store_id = v_store;
  RETURN jsonb_build_object(
    'has_store', true,
    'feature_enabled', v_feature,
    'min_payout', public.setting_int('marketplace_min_payout', 5000),
    'fee_bps', LEAST(GREATEST(public.setting_int('marketplace_withdrawal_fee_bps', 1500), 0), 5000),
    'bank', CASE WHEN v_bank.store_id IS NULL THEN NULL ELSE jsonb_build_object(
      'bank_name', v_bank.bank_name,
      'account_number', v_bank.account_number,
      'account_holder_name', v_bank.account_holder_name,
      'account_number_masked', '****' || right(regexp_replace(btrim(v_bank.account_number), '[ -]', '', 'g'), 4),
      'updated_at', v_bank.updated_at
    ) END
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_my_withdrawal_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_withdrawal_policy() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Simpan rekening seller (pemilik, via prosedur aman + audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_seller_bank_account(
  _bank_name text, _account_number text, _account_holder_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store uuid;
  v_masked text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;
  IF _bank_name IS NULL OR length(btrim(_bank_name)) NOT BETWEEN 2 AND 60
    OR _account_number IS NULL OR regexp_replace(btrim(_account_number), '[ -]', '', 'g') !~ '^[0-9]{6,25}$'
    OR _account_holder_name IS NULL OR length(btrim(_account_holder_name)) NOT BETWEEN 2 AND 100
  THEN RAISE EXCEPTION 'INVALID_BANK_ACCOUNT'; END IF;

  INSERT INTO public.seller_bank_accounts
    (store_id, bank_name, account_number, account_holder_name)
  VALUES
    (v_store, btrim(_bank_name), btrim(_account_number), btrim(_account_holder_name))
  ON CONFLICT (store_id) DO UPDATE
    SET bank_name = EXCLUDED.bank_name,
        account_number = EXCLUDED.account_number,
        account_holder_name = EXCLUDED.account_holder_name,
        updated_at = now();

  v_masked := '****' || right(regexp_replace(btrim(_account_number), '[ -]', '', 'g'), 4);
  PERFORM public.write_audit_log('seller.bank_account.save', 'seller_bank_account', v_store,
    NULL, jsonb_build_object('store_id', v_store, 'account_masked', v_masked,
                             'bank_name', btrim(_bank_name), 'holder', btrim(_account_holder_name)),
    'Perubahan rekening pencairan seller', NULL, NULL);

  RETURN jsonb_build_object('ok', true, 'account_masked', v_masked);
END; $$;
REVOKE ALL ON FUNCTION public.save_seller_bank_account(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_seller_bank_account(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Ajukan penarikan — transaksi atomik (validasi → kunci → reservasi)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  _gross_amount bigint, _idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store uuid;
  v_status_store text;
  v_bank record;
  v_min bigint;
  v_bps integer;
  v_gross bigint;
  v_fee bigint;
  v_net bigint;
  v_avail bigint;
  v_id uuid;
  v_number text;
  v_existing record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _idempotency_key IS NULL OR length(_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;

  -- Idempotensi lintas-retry: pengajuan dengan key sama untuk user sama
  -- mengembalikan hasil yang sama, bukan pengajuan kedua.
  SELECT * INTO v_existing FROM public.withdrawals WHERE idempotency_key = _idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.requested_by <> v_user THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    RETURN jsonb_build_object('withdrawal_id', v_existing.id,
      'withdrawal_number', v_existing.withdrawal_number, 'status', v_existing.status,
      'gross_amount', v_existing.gross_amount, 'fee_amount', v_existing.fee_amount,
      'net_amount', v_existing.net_amount, 'duplicate', true);
  END IF;

  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;

  -- Gate fitur: payout manual mati sampai legal/operational readiness disetujui.
  IF COALESCE((SELECT value FROM public.system_settings WHERE key = 'feature_manual_payout'),
      'false'::jsonb) <> 'true'::jsonb THEN
    RAISE EXCEPTION 'FEATURE_DISABLED'; END IF;

  SELECT status INTO v_status_store FROM public.stores WHERE id = v_store FOR UPDATE;
  IF v_status_store IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'STORE_INACTIVE'; END IF;

  SELECT * INTO v_bank FROM public.seller_bank_accounts WHERE store_id = v_store;
  IF v_bank.store_id IS NULL THEN RAISE EXCEPTION 'BANK_ACCOUNT_REQUIRED'; END IF;

  v_min := GREATEST(public.setting_int('marketplace_min_payout', 5000), 1);
  v_bps := LEAST(GREATEST(public.setting_int('marketplace_withdrawal_fee_bps', 1500), 0), 5000)::integer;

  v_gross := _gross_amount;
  IF v_gross IS NULL OR v_gross < 1 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF v_gross < v_min THEN RAISE EXCEPTION 'BELOW_MINIMUM'; END IF;

  -- Kunci transaksi per-store SEBELUM saldo dibaca (pola H-3 apply_credit_to_order).
  -- Tanpa ini dua pengajuan paralel bisa sama-sama lolos cek saldo.
  PERFORM pg_advisory_xact_lock(710006, hashtext(v_store::text));

  -- Cek ulang idempotensi di dalam kunci (double-click dengan key sama).
  SELECT * INTO v_existing FROM public.withdrawals WHERE idempotency_key = _idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.requested_by <> v_user THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    RETURN jsonb_build_object('withdrawal_id', v_existing.id,
      'withdrawal_number', v_existing.withdrawal_number, 'status', v_existing.status,
      'gross_amount', v_existing.gross_amount, 'fee_amount', v_existing.fee_amount,
      'net_amount', v_existing.net_amount, 'duplicate', true);
  END IF;

  -- Saldo tersedia (sudah memperhitungkan dana held, cadangan refund, dan
  -- pengajuan payout yang belum selesai — semuanya hasil hitung ledger).
  v_avail := public.get_store_balance(v_store);
  IF v_gross > v_avail THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  -- Fee dihitung server-side dan dikunci: half-up (gross*bps + 5000) / 10000.
  v_fee := (v_gross * v_bps + 5000) / 10000;
  v_net := v_gross - v_fee;
  IF v_net <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  INSERT INTO public.withdrawals
    (store_id, requested_by, gross_amount, fee_bps, fee_amount, net_amount, status,
     bank_name, bank_account_number, bank_account_holder, idempotency_key)
  VALUES
    (v_store, v_user, v_gross, v_bps, v_fee, v_net, 'requested',
     v_bank.bank_name, v_bank.account_number, v_bank.account_holder_name, _idempotency_key)
  RETURNING id, withdrawal_number INTO v_id, v_number;

  -- Reservasi: debit bruto dari ledger. Slot source_type='payout' memang
  -- disiapkan sejak seller_earnings_ledger. Insert fail-loud (tanpa ON
  -- CONFLICT): bila reservasi gagal, seluruh transaksi dibatalkan.
  INSERT INTO public.seller_ledger
    (store_id, direction, amount, gross_amount, platform_fee, source_type, source_id,
     reference, note, created_by, idempotency_key)
  VALUES
    (v_store, 'debit', v_gross, v_gross, 0, 'payout', v_id,
     'WDR:' || v_number, 'Reservasi penarikan ' || v_number, v_user,
     'payout:' || v_id::text || ':reserve');

  INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
  VALUES (v_id, 'requested', v_user,
    'Pengajuan ' || v_number || ': bruto ' || v_gross || ', fee ' || v_fee ||
    ' (' || v_bps || ' bps), neto ' || v_net);

  -- Tanda terima untuk seller (pola receipt submit_payment_proof): persisten di
  -- dalam transaksi yang sama, jadi bila reservasi gagal, notifikasi ikut batal.
  INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
  VALUES (v_user, 'payout.requested', 'Pengajuan penarikan terkirim',
    v_number || ' menunggu review finance. Saldo bruto ' || v_gross ||
    ' ditahan; perkiraan diterima ' || v_net || '.',
    'payout', v_id);

  INSERT INTO public.admin_tasks (task_type, source_type, source_id, title, description, priority)
  VALUES ('review_payout', 'withdrawal', v_id,
    'Review penarikan ' || v_number,
    'Pengajuan penarikan seller menunggu review finance.', 'high')
  ON CONFLICT (task_type, source_type, source_id) WHERE status IN ('open','in_progress','blocked') DO NOTHING;

  PERFORM public.notify_payout_staff('payout.requested', 'Pengajuan penarikan baru',
    'Pengajuan ' || v_number || ' menunggu review finance.', v_id);
  PERFORM public.write_audit_log('payout.request', 'withdrawal', v_id, NULL,
    jsonb_build_object('store_id', v_store, 'gross', v_gross, 'fee_bps', v_bps,
                       'fee', v_fee, 'net', v_net, 'status', 'requested'),
    NULL, NULL, NULL);

  RETURN jsonb_build_object('withdrawal_id', v_id, 'withdrawal_number', v_number,
    'status', 'requested', 'gross_amount', v_gross, 'fee_amount', v_fee,
    'net_amount', v_net, 'available_after', v_avail - v_gross, 'duplicate', false);
END; $$;
REVOKE ALL ON FUNCTION public.request_withdrawal(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Seller batalkan pengajuan (sebelum transfer) — reservasi dikembalikan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_own_withdrawal(_withdrawal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_store uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  v_store := public.my_store_id();
  IF v_store IS NULL THEN RAISE EXCEPTION 'NO_STORE'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND OR w.store_id <> v_store THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF w.status NOT IN ('requested','approved') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = 'cancelled', updated_at = now()
   WHERE id = w.id;

  INSERT INTO public.seller_ledger
    (store_id, direction, amount, gross_amount, platform_fee, source_type, source_id,
     reference, note, created_by, idempotency_key)
  VALUES
    (v_store, 'credit', w.gross_amount, w.gross_amount, 0, 'reversal', w.id,
     'WDR:' || w.withdrawal_number, 'Pembatalan penarikan ' || w.withdrawal_number,
     v_user, 'payout:' || w.id::text || ':reversal');

  INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
  VALUES (w.id, 'cancelled', v_user, 'Dibatalkan seller; saldo bruto dikembalikan.');

  PERFORM public.notify_payout_staff('payout.cancelled', 'Penarikan dibatalkan seller',
    w.withdrawal_number || ' dibatalkan oleh seller.', w.id);
  PERFORM public.write_audit_log('payout.cancel', 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('status', 'cancelled'), NULL, NULL, NULL);

  RETURN jsonb_build_object('status', 'cancelled', 'restored', w.gross_amount);
END; $$;
REVOKE ALL ON FUNCTION public.cancel_own_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_own_withdrawal(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. Review finance: setujui / tolak
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_withdrawal(
  _withdrawal_id uuid, _decision text, _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF NOT public.has_permission(v_user, 'payouts.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _decision = 'reject' AND (_reason IS NULL OR length(btrim(_reason)) < 5) THEN
    RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  -- Anti self-approval: pemilik toko tidak boleh memproses payout toko sendiri
  -- walaupun kebetulan memegang role finance/admin.
  SELECT s.owner_id INTO v_owner
    FROM public.withdrawals wd JOIN public.stores s ON s.id = wd.store_id
   WHERE wd.id = _withdrawal_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_owner = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.status <> 'requested' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = CASE _decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
         decision_note = NULLIF(btrim(COALESCE(_reason, '')), ''),
         decided_by = v_user,
         decided_at = now(),
         updated_at = now()
   WHERE id = w.id;

  IF _decision = 'reject' THEN
    -- Penolakan sebelum transfer: seluruh bruto dikembalikan, fee tidak dipungut.
    INSERT INTO public.seller_ledger
      (store_id, direction, amount, gross_amount, platform_fee, source_type, source_id,
       reference, note, created_by, idempotency_key)
    VALUES
      (w.store_id, 'credit', w.gross_amount, w.gross_amount, 0, 'reversal', w.id,
       'WDR:' || w.withdrawal_number, 'Penarikan ditolak: ' || btrim(_reason),
       v_user, 'payout:' || w.id::text || ':reversal');
    INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
    VALUES (w.id, 'rejected', v_user, btrim(_reason));
  ELSE
    INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
    VALUES (w.id, 'approved', v_user, NULLIF(btrim(COALESCE(_reason, '')), ''));
  END IF;

  UPDATE public.admin_tasks SET status = 'completed', completed_at = now(), note = _decision
    WHERE source_type = 'withdrawal' AND source_id = w.id AND status <> 'completed';

  IF w.requested_by IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (w.requested_by, 'payout.' || CASE _decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      CASE _decision WHEN 'approve' THEN 'Penarikan disetujui' ELSE 'Penarikan ditolak' END,
      CASE _decision WHEN 'approve'
        THEN w.withdrawal_number || ' disetujui dan akan diproses transfer manual.'
        ELSE w.withdrawal_number || ' ditolak. Alasan: ' || btrim(_reason) END,
      'payout', w.id);
  END IF;
  PERFORM public.write_audit_log('payout.' || _decision, 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('status', CASE _decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END),
    _reason, NULL, NULL);

  RETURN jsonb_build_object('status', CASE _decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END);
END; $$;
REVOKE ALL ON FUNCTION public.review_withdrawal(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_withdrawal(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 13. Finance mencatat transfer manual keluar (uang sudah dikirim dari bank)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_withdrawal_transfer(
  _withdrawal_id uuid, _bank_reference text, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'payouts.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _bank_reference IS NULL OR length(btrim(_bank_reference)) < 3 THEN
    RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;

  SELECT s.owner_id INTO v_owner
    FROM public.withdrawals wd JOIN public.stores s ON s.id = wd.store_id
   WHERE wd.id = _withdrawal_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_owner = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.status <> 'approved' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF w.bank_reference IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = 'transferred',
         bank_reference = btrim(_bank_reference),
         transfer_note = NULLIF(btrim(COALESCE(_note, '')), ''),
         transferred_by = v_user,
         transferred_at = now(),
         updated_at = now()
   WHERE id = w.id;

  INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
  VALUES (w.id, 'transferred', v_user,
    'Transfer dicatat (ref ' || btrim(_bank_reference) || '). Menunggu konfirmasi selesai.');

  IF w.requested_by IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (w.requested_by, 'payout.transferred', 'Dana penarikan dikirim',
      w.withdrawal_number || ' telah ditransfer manual. Status final menyusul setelah verifikasi.',
      'payout', w.id);
  END IF;
  PERFORM public.write_audit_log('payout.transfer_recorded', 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('status', 'transferred', 'bank_reference', btrim(_bank_reference)),
    _note, NULL, NULL);

  RETURN jsonb_build_object('status', 'transferred');
END; $$;
REVOKE ALL ON FUNCTION public.record_withdrawal_transfer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_withdrawal_transfer(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Konfirmasi selesai: fee 15% resmi jadi pendapatan platform
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_withdrawal(
  _withdrawal_id uuid, _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'payouts.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT s.owner_id INTO v_owner
    FROM public.withdrawals wd JOIN public.stores s ON s.id = wd.store_id
   WHERE wd.id = _withdrawal_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_owner = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.status <> 'transferred' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = 'completed',
         completed_by = v_user,
         completed_at = now(),
         updated_at = now()
   WHERE id = w.id;

  INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
  VALUES (w.id, 'completed', v_user,
    'Selesai. Neto ' || w.net_amount || ' diterima seller; fee ' || w.fee_amount ||
    ' menjadi pendapatan platform.');

  IF w.requested_by IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
    VALUES (w.requested_by, 'payout.completed', 'Penarikan selesai',
      w.withdrawal_number || ' selesai. Neto ' || w.net_amount || ' telah dikirim ke rekening Anda.',
      'payout', w.id);
  END IF;
  PERFORM public.write_audit_log('payout.complete', 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('status', 'completed', 'fee_recognized', w.fee_amount,
                       'net_paid', w.net_amount),
    _note, NULL, NULL);

  RETURN jsonb_build_object('status', 'completed');
END; $$;
REVOKE ALL ON FUNCTION public.complete_withdrawal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_withdrawal(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 15. Status transfer tak pasti → rekonsiliasi. TIDAK auto-retry, TIDAK
--     auto-reverse. Hanya keputusan finance berwenang yang menyelesaikannya.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_withdrawal_reconciliation(
  _withdrawal_id uuid, _note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_permission(v_user, 'payouts.process') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT s.owner_id INTO v_owner
    FROM public.withdrawals wd JOIN public.stores s ON s.id = wd.store_id
   WHERE wd.id = _withdrawal_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_owner = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.status <> 'transferred' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = 'needs_reconciliation', updated_at = now()
   WHERE id = w.id;

  INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
  VALUES (w.id, 'reconciliation_opened', v_user, btrim(_note));

  PERFORM public.notify_payout_staff('payout.reconciliation', 'Penarikan perlu rekonsiliasi',
    w.withdrawal_number || ' perlu rekonsiliasi: ' || btrim(_note), w.id);
  PERFORM public.write_audit_log('payout.reconciliation_open', 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('status', 'needs_reconciliation'), btrim(_note), NULL, NULL);

  RETURN jsonb_build_object('status', 'needs_reconciliation');
END; $$;
REVOKE ALL ON FUNCTION public.mark_withdrawal_reconciliation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_reconciliation(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_withdrawal_reconciliation(
  _withdrawal_id uuid, _outcome text, _note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  w public.withdrawals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF _outcome IS NULL OR _outcome NOT IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_DECISION'; END IF;
  IF NOT public.has_permission(v_user, 'payouts.approve') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT s.owner_id INTO v_owner
    FROM public.withdrawals wd JOIN public.stores s ON s.id = wd.store_id
   WHERE wd.id = _withdrawal_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_owner = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'; END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF w.status <> 'needs_reconciliation' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;

  UPDATE public.withdrawals
     SET status = CASE _outcome WHEN 'completed' THEN 'completed' ELSE 'cancelled' END,
         completed_by = CASE _outcome WHEN 'completed' THEN v_user ELSE NULL END,
         completed_at = CASE _outcome WHEN 'completed' THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = w.id;

  IF _outcome = 'completed' THEN
    INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
    VALUES (w.id, 'completed', v_user,
      'Rekonsiliasi selesai: transfer terkonfirmasi. ' || btrim(_note));
    IF w.requested_by IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (w.requested_by, 'payout.completed', 'Penarikan selesai',
        w.withdrawal_number || ' selesai setelah rekonsiliasi transfer.', 'payout', w.id);
    END IF;
  ELSE
    -- Dana terkonfirmasi TIDAK pernah keluar dari bank: reversi penuh, fee
    -- tidak dipungut. Keputusan manual berwenang, bukan auto-reverse.
    INSERT INTO public.seller_ledger
      (store_id, direction, amount, gross_amount, platform_fee, source_type, source_id,
       reference, note, created_by, idempotency_key)
    VALUES
      (w.store_id, 'credit', w.gross_amount, w.gross_amount, 0, 'reversal', w.id,
       'WDR:' || w.withdrawal_number, 'Rekonsiliasi: transfer tidak terjadi. ' || btrim(_note),
       v_user, 'payout:' || w.id::text || ':reversal');
    INSERT INTO public.withdrawal_events (withdrawal_id, event_type, actor_id, note)
    VALUES (w.id, 'cancelled', v_user, 'Rekonsiliasi: dana tidak keluar, saldo dikembalikan. ' || btrim(_note));
    IF w.requested_by IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, type, title, message, related_type, related_id)
      VALUES (w.requested_by, 'payout.cancelled', 'Penarikan dibatalkan',
        w.withdrawal_number || ' dibatalkan setelah rekonsiliasi. Saldo dikembalikan.', 'payout', w.id);
    END IF;
  END IF;

  PERFORM public.write_audit_log('payout.reconciliation_resolve', 'withdrawal', w.id, to_jsonb(w),
    jsonb_build_object('outcome', _outcome), btrim(_note), NULL, NULL);

  RETURN jsonb_build_object('status', CASE _outcome WHEN 'completed' THEN 'completed' ELSE 'cancelled' END);
END; $$;
REVOKE ALL ON FUNCTION public.resolve_withdrawal_reconciliation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_withdrawal_reconciliation(uuid, text, text) TO authenticated;
