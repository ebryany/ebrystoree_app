-- =========================================================
-- Slice 1: RBAC granular, email profile sync, audit write path
-- =========================================================

-- 1) PERMISSIONS ------------------------------------------------
CREATE TABLE public.permissions (
  key text PRIMARY KEY,
  group_name text NOT NULL,
  description text NOT NULL,
  is_transactional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_select_staff ON public.permissions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY permissions_write_admin ON public.permissions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('admin.dashboard.view','Dashboard','Melihat dashboard admin',false),
  ('products.view','Produk Digital','Melihat semua produk digital',false),
  ('products.create','Produk Digital','Membuat produk digital',false),
  ('products.update','Produk Digital','Mengubah produk digital',false),
  ('products.delete','Produk Digital','Menghapus produk digital',false),
  ('services.view','Layanan Joki','Melihat semua layanan',false),
  ('services.create','Layanan Joki','Membuat layanan',false),
  ('services.update','Layanan Joki','Mengubah layanan',false),
  ('services.delete','Layanan Joki','Menghapus layanan',false),
  ('categories.manage','Kategori','Mengelola kategori katalog',false),
  ('users.view','Pengguna','Melihat daftar pengguna',false),
  ('users.manage','Pengguna','Mengelola data pengguna',false),
  ('roles.view','Peran','Melihat peran pengguna',false),
  ('roles.manage','Peran','Memberi/mencabut peran pengguna',false),
  ('permissions.view','Izin','Melihat matriks izin',false),
  ('permissions.manage','Izin','Mengubah izin per peran',false),
  ('audit_logs.view','Audit','Melihat catatan audit',false),
  ('settings.view','Pengaturan','Melihat pengaturan sistem',false),
  ('settings.manage','Pengaturan','Mengubah pengaturan sistem',false),
  ('orders.view','Order','Melihat order',true),
  ('orders.update','Order','Mengubah status order',true),
  ('orders.assign','Order','Menugaskan operator pada order',true),
  ('payments.view','Pembayaran','Melihat pembayaran',true),
  ('payments.verify','Pembayaran','Memverifikasi pembayaran',true),
  ('payments.reject','Pembayaran','Menolak pembayaran',true),
  ('refunds.view','Refund','Melihat pengajuan refund',true),
  ('refunds.approve','Refund','Menyetujui refund',true),
  ('tasks.view','Task','Melihat task operasional',true),
  ('tasks.manage','Task','Mengelola task operasional',true),
  ('reports.view','Laporan','Melihat laporan',true),
  ('reports.export','Laporan','Mengekspor laporan',true);

-- 2) ROLE PERMISSIONS -------------------------------------------
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission_key)
);

CREATE INDEX idx_role_permissions_role ON public.role_permissions(role);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_select_staff ON public.role_permissions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY role_permissions_write_admin ON public.role_permissions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- super_admin: seluruh izin (juga punya bypass terkontrol di fungsi)
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'super_admin'::public.app_role, key FROM public.permissions;

-- admin: tidak otomatis semua izin
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM public.permissions WHERE key IN (
  'admin.dashboard.view','products.view','products.create','products.update','products.delete',
  'services.view','services.create','services.update','services.delete','categories.manage',
  'users.view','users.manage','roles.view','roles.manage','permissions.view','audit_logs.view',
  'settings.view','orders.view','payments.view','refunds.view','tasks.view','reports.view'
);

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'finance'::public.app_role, key FROM public.permissions WHERE key IN (
  'admin.dashboard.view','orders.view','payments.view','payments.verify','payments.reject',
  'refunds.view','refunds.approve','reports.view','reports.export','audit_logs.view'
);

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'support'::public.app_role, key FROM public.permissions WHERE key IN (
  'admin.dashboard.view','products.view','services.view','users.view','orders.view','tasks.view'
);

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'operator'::public.app_role, key FROM public.permissions WHERE key IN (
  'admin.dashboard.view','orders.view','orders.update','tasks.view','tasks.manage'
);

-- 3) PERMISSION FUNCTIONS ---------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = 'super_admin'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id AND rp.permission_key = _permission
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.is_super_admin(auth.uid()) THEN p.key ELSE rp.permission_key END
  FROM public.permissions p
  LEFT JOIN public.role_permissions rp
    ON rp.permission_key = p.key
   AND rp.role IN (SELECT role FROM public.user_roles WHERE user_id = auth.uid())
  WHERE public.is_super_admin(auth.uid()) OR rp.permission_key IS NOT NULL
  GROUP BY p.key, rp.permission_key;
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

-- 4) PROFILE EMAIL SYNC -----------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET email = lower(u.email)
FROM auth.users u
WHERE u.id = p.id AND u.email IS NOT NULL AND p.email IS DISTINCT FROM lower(u.email);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_idx ON public.profiles (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_email_search_idx ON public.profiles (email text_pattern_ops);

-- email hanya boleh diisi lewat jalur terkontrol (SECURITY DEFINER), bukan update profil biasa
CREATE OR REPLACE FUNCTION public.protect_profile_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND current_setting('app.allow_email_sync', true) IS DISTINCT FROM 'on' THEN
    NEW.email := OLD.email;
  END IF;
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_protect_email
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_email();

-- reuse trigger yang sudah ada (on_auth_user_created), tanpa membuat trigger duplikat
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), lower(NEW.email))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- fallback bila trigger gagal / email berubah di provider auth
CREATE OR REPLACE FUNCTION public.sync_my_profile_email()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.allow_email_sync', 'on', true);
  INSERT INTO public.profiles (id, email) VALUES (auth.uid(), v_email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
  WHERE public.profiles.email IS DISTINCT FROM EXCLUDED.email;
  PERFORM set_config('app.allow_email_sync', 'off', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_my_profile_email() FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_my_profile_email() TO authenticated;

-- 5) PROTEKSI PERAN ---------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_role_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE super_count int;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'super_admin' THEN
    SELECT count(*) INTO super_count FROM public.user_roles WHERE role = 'super_admin';
    IF super_count <= 1 THEN
      RAISE EXCEPTION 'Super admin terakhir tidak dapat dihapus';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL AND NEW.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Tidak dapat memberi peran untuk akun sendiri';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_roles_protect
BEFORE INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_role_changes();

CREATE POLICY user_roles_insert_manage ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'roles.manage'));
CREATE POLICY user_roles_delete_manage ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), 'roles.manage'));

GRANT INSERT, DELETE ON public.user_roles TO authenticated;

-- 6) AUDIT LOG WRITE PATH ---------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit_log(
  _action text,
  _entity_type text,
  _entity_id uuid DEFAULT NULL,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _reason text DEFAULT NULL,
  _ip text DEFAULT NULL,
  _trace_id text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT string_agg(role::text, ',' ORDER BY role::text) INTO v_role
  FROM public.user_roles WHERE user_id = auth.uid();

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, ip, trace_id)
  VALUES (auth.uid(), v_role, _action, _entity_type, _entity_id, _before, _after, _reason, _ip, _trace_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, uuid, jsonb, jsonb, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, uuid, jsonb, jsonb, text, text, text) TO authenticated;