-- Tabel yang sudah di-subscribe klien (useRealtimeRefresh) tetapi belum terdaftar
-- di publication supabase_realtime, sehingga event tidak pernah terkirim:
-- saldo, top-up, payout, PO custom, katalog jasa, toko, ledger seller, item pesanan,
-- detail pesanan jasa akademik. Semua tabel ini ber-RLS, jadi event hanya sampai ke
-- pengguna yang memang boleh membaca barisnya.
-- audit_logs sengaja tidak didaftarkan (volume tinggi, cukup refetch via tabel lain).
-- Idempoten: guard pg_publication_tables mencegah error "already member".

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_ledger',
    'credit_topups',
    'withdrawals',
    'withdrawal_events',
    'custom_orders',
    'po_payments',
    'marketplace_services',
    'stores',
    'seller_ledger',
    'order_items',
    'service_order_details'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
