-- Cleanup: hapus RPC verifikasi cron sementara.
DROP FUNCTION IF EXISTS public.__verify_cron();
