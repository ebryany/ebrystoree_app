-- ============ EBRYSTORE: FONDASI (auth, roles, settings, katalog, audit) ============

-- Trigger util
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ---------- ROLES ----------
CREATE TYPE public.app_role AS ENUM ('customer','operator','support','finance','admin','super_admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('operator','support','finance','admin','super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  );
$$;

CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_roles_select_admin" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ---------- PROFILES ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_select_staff" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-provision profil + role customer saat pendaftaran
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- SYSTEM SETTINGS ----------
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_public" ON public.system_settings
  FOR SELECT TO anon, authenticated USING (is_public = true);
CREATE POLICY "settings_select_admin" ON public.system_settings
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "settings_write_admin" ON public.system_settings
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('store_name', '"Ebrystore"', 'Nama toko', true),
  ('admin_fee', '2500', 'Biaya admin per transaksi (IDR)', true),
  ('manual_payment_method', '"DANA"', 'Metode pembayaran manual', false),
  ('manual_payment_number', '"087782462607"', 'Nomor tujuan pembayaran manual', false),
  ('manual_payment_holder', '""', 'Nama pemilik akun pembayaran manual (diisi Owner)', false),
  ('manual_payment_deadline_hours', '24', 'Batas waktu pembayaran manual (jam)', true),
  ('download_limit_default', '5', 'Batas unduhan default per pembelian', true),
  ('download_validity_days', '365', 'Masa aktif akses unduhan (hari)', true),
  ('product_file_max_mb', '100', 'Batas ukuran file produk digital (MB)', false),
  ('proof_file_max_mb', '5', 'Batas ukuran bukti pembayaran (MB)', false),
  ('payment_provider', '"midtrans"', 'Payment gateway QRIS terpilih', false);

-- ---------- KATEGORI ----------
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('product','service')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT TO anon, authenticated USING (is_active = true AND deleted_at IS NULL);
CREATE POLICY "categories_admin_all" ON public.categories
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- PRODUK DIGITAL ----------
CREATE TABLE public.digital_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  short_description text,
  description text,
  thumbnail_url text,
  price bigint NOT NULL CHECK (price >= 0),
  discount_price bigint CHECK (discount_price IS NULL OR discount_price >= 0),
  currency text NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  download_limit int NOT NULL DEFAULT 5 CHECK (download_limit > 0),
  validity_days int NOT NULL DEFAULT 365 CHECK (validity_days > 0),
  usage_notes text,
  version text,
  sold_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_digital_products_status ON public.digital_products (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_digital_products_category ON public.digital_products (category_id);
GRANT SELECT ON public.digital_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.digital_products TO authenticated;
GRANT ALL ON public.digital_products TO service_role;
ALTER TABLE public.digital_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_public" ON public.digital_products
  FOR SELECT TO anon, authenticated USING (status = 'published' AND deleted_at IS NULL);
CREATE POLICY "products_select_admin" ON public.digital_products
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "products_write_admin" ON public.digital_products
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER digital_products_updated_at BEFORE UPDATE ON public.digital_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- File produk: TIDAK pernah dibaca dari klien (hanya service_role / server)
CREATE TABLE public.digital_product_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.digital_products(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  version text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_files_product ON public.digital_product_files (product_id);
GRANT ALL ON public.digital_product_files TO service_role;
ALTER TABLE public.digital_product_files ENABLE ROW LEVEL SECURITY;
-- Sengaja tanpa policy untuk anon/authenticated: akses file hanya lewat server terverifikasi.

-- ---------- LAYANAN JASA ----------
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  short_description text,
  description text,
  thumbnail_url text,
  requirements_note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  order_capacity int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_services_status ON public.services (status) WHERE deleted_at IS NULL;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select_public" ON public.services
  FOR SELECT TO anon, authenticated USING (status = 'published' AND deleted_at IS NULL);
CREATE POLICY "services_select_admin" ON public.services
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "services_write_admin" ON public.services
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price bigint NOT NULL CHECK (price >= 0),
  estimated_days int NOT NULL DEFAULT 3 CHECK (estimated_days > 0),
  free_revisions int NOT NULL DEFAULT 1 CHECK (free_revisions >= 0),
  sla_hours int,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','priority','express')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_packages_service ON public.service_packages (service_id);
GRANT SELECT ON public.service_packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_packages TO authenticated;
GRANT ALL ON public.service_packages TO service_role;
ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packages_select_public" ON public.service_packages
  FOR SELECT TO anon, authenticated USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND s.status = 'published' AND s.deleted_at IS NULL
    )
  );
CREATE POLICY "packages_write_admin" ON public.service_packages
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER service_packages_updated_at BEFORE UPDATE ON public.service_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.service_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price bigint NOT NULL CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_addons_service ON public.service_addons (service_id);
GRANT SELECT ON public.service_addons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_addons TO authenticated;
GRANT ALL ON public.service_addons TO service_role;
ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addons_select_public" ON public.service_addons
  FOR SELECT TO anon, authenticated USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_id AND s.status = 'published' AND s.deleted_at IS NULL
    )
  );
CREATE POLICY "addons_write_admin" ON public.service_addons
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER service_addons_updated_at BEFORE UPDATE ON public.service_addons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- AUDIT LOG ----------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  ip text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_created ON public.audit_logs (created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
-- Tanpa policy INSERT/UPDATE/DELETE: audit log hanya ditulis server (service_role) dan tidak dapat diubah.