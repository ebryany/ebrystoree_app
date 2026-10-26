-- Banner background home: bucket aset gambar, permission branding, guard settings.
-- Bucket catalog-images belum ada pada project ini (preflight 2026-10-03); pembuatan
-- mengikuti pola bucket payment-proofs. Policy staff catalog-images yang sudah ada
-- tidak diubah. Upload banner berjalan lewat server function (service role), bukan
-- klien langsung, sehingga tidak menambah policy storage.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalog-images', 'catalog-images', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Permission section Branding pada registry settings. super_admin saja; admin
-- tetap view-only seperti sebelum migration ini.
INSERT INTO public.permissions (key, group_name, description, is_transactional)
VALUES ('settings.branding.update', 'Pengaturan', 'Mengubah aset branding: logo dan banner home', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT r::public.app_role, 'settings.branding.update'
FROM unnest(ARRAY['super_admin']) AS r
ON CONFLICT DO NOTHING;

-- Key banner pada system_settings hanya boleh ditulis pemegang izin branding.
-- RLS settings_write_admin (is_admin) tidak dapat dipersempit tanpa memengaruhi
-- settings lain, jadi guard dipasang sebagai trigger per baris. Service role
-- (server function) tetap diizinkan.
CREATE OR REPLACE FUNCTION public.guard_home_banner_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_claims text;
BEGIN
  v_key := COALESCE(NEW.key, OLD.key);
  IF v_key IS NULL OR v_key NOT LIKE 'home_banner_%' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  IF v_claims IS NOT NULL AND (v_claims::jsonb ->> 'role') = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF auth.uid() IS NOT NULL AND public.has_permission(auth.uid(), 'settings.branding.update') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'BRANDING_PERMISSION_REQUIRED';
END;
$$;

DROP TRIGGER IF EXISTS home_banner_settings_guard ON public.system_settings;
CREATE TRIGGER home_banner_settings_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_home_banner_settings();
