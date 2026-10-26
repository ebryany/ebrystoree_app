-- BLOCKER-1 (koreksi grant): REVOKE per kolom pada migration 20261004090000
-- tidak efektif karena grant UPDATE level tabel masih ada. PostgreSQL
-- menggabungkan grant tabel dan grant kolom; selama grant tabel ada, seluruh
-- kolom tetap dapat di-update.
--
-- Migration ini mencabut grant tabel dan memberikan kembali hanya kolom profil.
-- Trigger stores_protect_privileged dari migration sebelumnya tetap aktif sebagai
-- lapisan kedua, sehingga percobaan mengubah kolom kewenangan tetap dikoreksi
-- walau grant lolos.

REVOKE UPDATE ON public.stores FROM authenticated;
GRANT UPDATE (name, description, logo_url, contact_phone, contact_email) ON public.stores TO authenticated;
