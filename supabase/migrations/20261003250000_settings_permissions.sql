-- Tata kelola izin pengaturan website.
--
-- Kode memakai sepuluh permission pengaturan (settings.website.update,
-- settings.contact.update, settings.navigation.update, settings.seo.update,
-- settings.commerce.update, settings.payment.update, settings.features.update,
-- settings.maintenance.update, settings.branding.update, settings.website.view),
-- tetapi database hanya memiliki tiga: settings.view, settings.manage, dan
-- settings.branding.update.
--
-- Akibatnya has_permission() selalu false untuk sembilan permission, dan satu-
-- satunya alasan halaman masih dapat disimpan adalah bypass super_admin, yang
-- sekaligus membanjiri audit log dengan entri permission.super_admin_bypass.
-- Admin biasa dengan settings.view dapat melihat tetapi tidak pernah dapat
-- menyimpan, tanpa penjelasan.
--
-- Migration ini mendaftarkan permission yang hilang dan memetakan perannya:
-- admin mengelola konten dan identitas; keputusan uang, fitur, dan marketplace
-- tetap di super_admin.

INSERT INTO public.permissions (key, group_name, description, is_transactional) VALUES
  ('settings.website.view',      'Pengaturan', 'Melihat pengaturan website',                      false),
  ('settings.website.update',    'Pengaturan', 'Mengubah pengaturan umum website',                false),
  ('settings.contact.update',    'Pengaturan', 'Mengubah kontak dan alamat',                      false),
  ('settings.navigation.update', 'Pengaturan', 'Mengubah navigasi header dan footer',             false),
  ('settings.seo.update',        'Pengaturan', 'Mengubah metadata SEO dan berbagi',               false),
  ('settings.commerce.update',   'Pengaturan', 'Mengubah aturan storefront dan layanan akademik', false),
  ('settings.payment.update',    'Pengaturan', 'Mengubah aturan order dan pembayaran',            false),
  ('settings.features.update',   'Pengaturan', 'Mengubah feature flag',                           false),
  ('settings.maintenance.update','Pengaturan', 'Mengubah mode maintenance',                       false),
  ('settings.marketplace.update','Pengaturan', 'Mengubah aturan marketplace: jasa, escrow, moderasi, seller', false)
ON CONFLICT (key) DO NOTHING;

-- admin: konten, identitas, navigasi, SEO. Bukan uang, fitur, atau marketplace.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin'::public.app_role, key FROM unnest(ARRAY[
  'settings.website.view', 'settings.website.update', 'settings.contact.update',
  'settings.navigation.update', 'settings.seo.update'
]) AS key
ON CONFLICT (role, permission_key) DO NOTHING;

-- super_admin: seluruh pengaturan, termasuk keputusan uang dan marketplace.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'super_admin'::public.app_role, key FROM unnest(ARRAY[
  'settings.website.view', 'settings.website.update', 'settings.contact.update',
  'settings.navigation.update', 'settings.seo.update', 'settings.commerce.update',
  'settings.payment.update', 'settings.features.update', 'settings.maintenance.update',
  'settings.marketplace.update', 'settings.branding.update'
]) AS key
ON CONFLICT (role, permission_key) DO NOTHING;
