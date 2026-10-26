-- ============================================================================
-- MARKETPLACE — PROMPT 06: Seller Role, Store & Permission Model
--
-- Tujuan: menjadikan "seller" aktor first-class dengan toko, permission, dan
--         isolasi RLS. BELUM bisa jualan (kepemilikan katalog = slice 11–16).
--
-- Keputusan Owner (MGRCAO):
--   M-05  satu toko per akun seller (model tidak dibuat buntu untuk multi-store)
--   M-09  isolasi seller via RLS + server authz, bukan UI
--
-- Sifat: ADITIF. Tidak mengubah tabel/perilaku lama.
-- Lingkungan: LOKAL / Supabase baru. JANGAN production tanpa persetujuan.
--
-- Rollback: drop policy/trigger/functions/tabel stores; hapus permission seller;
--           (enum app_role TIDAK bisa dihapus nilai di PostgreSQL — dibiarkan).
-- ============================================================================

-- 1) ROLE SELLER: dipindah ke migrasi 20260930100009b (batasan PostgreSQL:
--    nilai enum baru tidak boleh dipakai dalam transaksi yang sama dengan
--    ALTER TYPE ADD VALUE).

-- 2) PERMISSION SELLER --------------------------------------------------------
INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('seller.dashboard.view',   'Seller', 'Melihat dashboard seller',              false),
  ('seller.store.manage',     'Seller', 'Mengelola profil toko sendiri',         false),
  ('seller.products.manage',  'Seller', 'Mengelola produk milik toko sendiri',   true),
  ('seller.orders.view',      'Seller', 'Melihat pesanan untuk toko sendiri',    true),
  ('seller.earnings.view',    'Seller', 'Melihat pendapatan toko sendiri',       true)
ON CONFLICT (key) DO NOTHING;

-- Pihak platform (admin) yang menangani seller.
INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('sellers.view',    'Marketplace', 'Melihat daftar seller',              false),
  ('sellers.approve', 'Marketplace', 'Menyetujui/menolak seller',          false),
  ('sellers.manage',  'Marketplace', 'Mengelola status seller (suspend)',  true)
ON CONFLICT (key) DO NOTHING;

-- Pemetaan role → permission.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'seller'::public.app_role, key FROM public.permissions WHERE key IN (
  'seller.dashboard.view','seller.store.manage','seller.products.manage',
  'seller.orders.view','seller.earnings.view','catalog.view'
)
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM public.permissions WHERE key IN (
  'sellers.view','sellers.approve','sellers.manage'
)
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'support'::public.app_role, key FROM public.permissions WHERE key IN (
  'sellers.view'
)
ON CONFLICT (role, permission_key) DO NOTHING;

-- 3) TABEL STORES -------------------------------------------------------------
-- Satu toko per seller (M-05). Model TIDAK dibuat buntu: kolom id terpisah,
-- sehingga kelak multi-store hanya perlu melonggarkan unique(owner_id).
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,                      -- akun pemilik (profiles.id)
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  logo_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','rejected')),
  -- data onboarding/verifikasi (O-06 belum diputuskan → kolom nullable)
  contact_phone text,
  contact_email text,
  verification_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Satu toko per owner untuk MVP.
CREATE UNIQUE INDEX IF NOT EXISTS stores_owner_unique ON public.stores (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_unique ON public.stores (slug);
CREATE INDEX IF NOT EXISTS idx_stores_status ON public.stores (status);

GRANT SELECT ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Toko aktif dapat dilihat publik (storefront) — via anon tidak diberi akses
-- langsung; storefront publik akan lewat server function. Untuk authenticated:
DROP POLICY IF EXISTS stores_select_own ON public.stores;
CREATE POLICY stores_select_own ON public.stores
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_select_staff ON public.stores;
CREATE POLICY stores_select_staff ON public.stores
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'sellers.view'));

-- Owner boleh mengubah tokonya sendiri (kecuali kolom review — dijaga RPC/trigger).
DROP POLICY IF EXISTS stores_update_own ON public.stores;
CREATE POLICY stores_update_own ON public.stores
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- 4) TRIGGER updated_at -------------------------------------------------------
DROP TRIGGER IF EXISTS stores_set_updated_at ON public.stores;
CREATE TRIGGER stores_set_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) HELPER: toko milik pemanggil --------------------------------------------
CREATE OR REPLACE FUNCTION public.my_store_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.stores WHERE owner_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_store(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores WHERE owner_id = _user_id AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.my_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_store_id() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store(uuid) TO authenticated;
