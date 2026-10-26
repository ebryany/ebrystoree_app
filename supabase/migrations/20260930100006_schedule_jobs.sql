-- ============================================================================
-- AKTIFKAN SCHEDULER (pg_cron)
--
-- Masalah (A-02): pg_cron + pg_net sudah diinstal, tiga job function sudah ada
--   (job_expire_orders, job_flag_overdue_tasks, job_check_sla_breach), tetapi
--   TIDAK ADA satu pun cron.schedule() — sehingga job tidak pernah berjalan
--   otomatis. Hanya bisa dipicu manual.
--
-- Perbaikan (aditif): daftarkan ketiga job ke pg_cron.
--   - expire_orders      : setiap 10 menit
--   - flag_overdue_tasks : setiap jam (menit ke-5)
--   - check_sla_breach   : setiap 30 menit
--
-- Idempotensi: cron.schedule dengan nama job yang sama akan menimpa (upsert),
--   jadi migrasi dapat dijalankan ulang tanpa menggandakan job.
--
-- Rollback: SELECT cron.unschedule('expire_orders'); dst untuk ketiga job.
--
-- Lingkungan: LOKAL / Supabase baru saja. JANGAN production tanpa persetujuan.
-- ============================================================================

-- Bersihkan jadwal lama (bila ada) lalu daftarkan ulang — idempoten.
DO $$
DECLARE j text;
BEGIN
  FOR j IN SELECT unnest(ARRAY['expire_orders','flag_overdue_tasks','check_sla_breach']) LOOP
    PERFORM cron.unschedule(j) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j);
  END LOOP;
END $$;

SELECT cron.schedule('expire_orders',      '*/10 * * * *', $$SELECT public.job_expire_orders()$$);
SELECT cron.schedule('flag_overdue_tasks', '5 * * * *',    $$SELECT public.job_flag_overdue_tasks()$$);
SELECT cron.schedule('check_sla_breach',   '*/30 * * * *', $$SELECT public.job_check_sla_breach()$$);
