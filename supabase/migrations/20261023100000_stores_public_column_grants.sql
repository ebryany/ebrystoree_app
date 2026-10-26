-- API-SEC-007: batasi kolom privat `stores` dari pembacaan anonim.
--
-- Temuan: policy stores_select_public memberi SELECT seluruh baris untuk anon,
-- dan grant tabel penuh membuat PostgREST mengembalikan SEMUA kolom termasuk
-- contact_email, verification_note, suspended_reason, reviewed_by, owner_id.
-- Dibuktikan dengan select=* memakai anon key: seluruh kolom di atas terbaca.
--
-- Perbaikan minimal: cabut SELECT level tabel, beri SELECT hanya kolom yang
-- memang dipakai storefront publik. contact_phone tetap publik karena tombol
-- WhatsApp di halaman toko membutuhkannya.
--
-- RLS tidak diubah: stores_select_public tetap membatasi baris ke status aktif.

REVOKE SELECT ON public.stores FROM anon;

GRANT SELECT (
  id,
  name,
  slug,
  description,
  logo_url,
  banner_url,
  banner_position,
  status,
  contact_phone,
  created_at,
  is_platform
) ON public.stores TO anon;

-- Authenticated (seller/admin) tetap memakai grant tabel yang sudah ada;
-- akses barisnya tetap dibatasi policy stores_select_own/staff.
