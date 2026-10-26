-- BLOCKER-1: seller dapat mengaktifkan kembali tokonya yang di-suspend.
--
-- Temuan: policy stores_update_own hanya memeriksa owner_id, tidak membatasi kolom.
-- Grant kolom authenticated mencakup status, is_platform, reviewed_by, reviewed_at,
-- suspended_reason, owner_id, slug. Trigger pada stores hanya set_updated_at.
-- Akibatnya seller dapat memanggil PostgREST langsung dengan JWT-nya sendiri:
--   PATCH /rest/v1/stores?id=eq.<store_id>  { "status": "active" }
-- dan sanksi admin hilang.
--
-- Perbaikan dua lapis:
--   1. Trigger yang mengembalikan kolom sensitif ke nilai lama untuk non-admin.
--      Dipilih "kembalikan nilai lama", bukan RAISE EXCEPTION, supaya alur normal
--      yang mengirim seluruh baris (mis. updateMyStore) tidak ikut gagal.
--   2. Cabut grant UPDATE kolom sensitif dari authenticated; sisakan kolom profil
--      yang memang hak seller (name, description, logo_url, contact_phone,
--      contact_email).

CREATE OR REPLACE FUNCTION public.protect_store_privileged_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Admin platform dan service_role bebas; mereka jalur resmi perubahan status.
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-admin (seller) tidak boleh menyentuh kolom kewenangan platform.
  NEW.status := OLD.status;
  NEW.is_platform := OLD.is_platform;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.suspended_reason := OLD.suspended_reason;
  NEW.owner_id := OLD.owner_id;
  NEW.slug := OLD.slug;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stores_protect_privileged ON public.stores;
CREATE TRIGGER stores_protect_privileged
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.protect_store_privileged_fields();

-- Cabut grant UPDATE level tabel, lalu berikan kembali HANYA kolom profil.
-- REVOKE per kolom tidak efektif selama grant level tabel masih ada, karena
-- PostgreSQL menggabungkan keduanya. Karena itu grant tabel dicabut lebih dulu.
REVOKE UPDATE ON public.stores FROM authenticated;
GRANT UPDATE (name, description, logo_url, contact_phone, contact_email) ON public.stores TO authenticated;
