-- Cleanup: hapus RPC verifikasi sementara (dipakai untuk membuktikan perbaikan A-01).
DROP FUNCTION IF EXISTS public.__verify_refund_fix();
