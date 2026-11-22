-- ============================================================================
-- EBRYSTORE — Real-Time Seller Notification & Admin Event Center
--
-- Tujuan:
--   1. Memperluas tabel existing `public.notifications` secara aditif
--      (dedupe_key, event_ref, action_url, metadata) tanpa membuat sistem
--      notifikasi duplikat.
--   2. Menjamin pengantaran realtime (`supabase_realtime`) pada `notifications`
--      dan `stores` serta isolasi baca/tulis per admin via RLS existing.
--   3. Menyediakan helper `notify_seller_admins()` yang me-fanout notifikasi
--      independen ke setiap akun berizin `sellers.view` atau `super_admin`
--      dengan pencegahan duplikasi (`ON CONFLICT DO NOTHING`).
--   4. Membangun trigger server-authoritative untuk event bisnis seller nyata:
--      - Pendaftaran & aktivasi otomatis seller (`stores` INSERT)
--      - Pengajuan ulang, persetujuan, penolakan, penangguhan, reaktivasi,
--        serta pembaruan informasi penting toko (`stores` UPDATE)
--      - Pengajuan moderasi produk seller (`digital_products`)
--      - Pengajuan moderasi jasa seller (`marketplace_services`)
--
-- Sifat: ADITIF & BACKWARD-COMPATIBLE.
-- Catatan: JANGAN jalankan langsung ke produksi tanpa tinjauan & persetujuan.
-- ============================================================================

-- 1) PERLUAS KOLOM `public.notifications` (ADITIF) ----------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS event_ref text,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Cegah notifikasi ganda untuk penerima & kunci deduplikasi yang sama.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_dedupe
  ON public.notifications (recipient_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_type_created
  ON public.notifications (recipient_id, type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

-- 2) PASTIKAN REALTIME PUBLICATION & REPLICA IDENTITY AKTIF ------------------
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.stores REPLICA IDENTITY FULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'stores']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

-- 3) HELPER SERVER-AUTHORITATIVE: FANOUT NOTIFIKASI ADMIN SELLER -------------
CREATE OR REPLACE FUNCTION public.notify_seller_admins(
  _type text,
  _title text,
  _message text,
  _store_id uuid,
  _dedupe_key text,
  _event_ref text,
  _action_url text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _exclude_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    recipient_id,
    type,
    title,
    message,
    related_type,
    related_id,
    dedupe_key,
    event_ref,
    action_url,
    metadata
  )
  SELECT DISTINCT
    ur.user_id,
    _type,
    _title,
    _message,
    CASE WHEN _store_id IS NOT NULL THEN 'store' ELSE NULL END,
    _store_id,
    _dedupe_key,
    _event_ref,
    _action_url,
    COALESCE(_metadata, '{}'::jsonb)
  FROM public.user_roles ur
  WHERE (
    ur.role = 'super_admin'
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      WHERE rp.role = ur.role
        AND rp.permission_key = 'sellers.view'
    )
  )
  AND (_exclude_actor IS NULL OR ur.user_id <> _exclude_actor)
  ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_seller_admins(
  text, text, text, uuid, text, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_seller_admins(
  text, text, text, uuid, text, text, text, jsonb, uuid
) TO service_role;

-- 4) TRIGGER EVENT TOKO / SELLER (`public.stores`) ----------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_admin_store_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_bucket text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
  v_action text;
  v_meta jsonb;
  v_changed text[] := ARRAY[]::text[];
BEGIN
  IF COALESCE(NEW.is_platform, false) THEN
    RETURN NEW;
  END IF;

  v_action := '/admin/seller/' || NEW.id::text;
  v_meta := jsonb_build_object(
    'store_id', NEW.id,
    'store_name', NEW.name,
    'store_slug', NEW.slug,
    'status', NEW.status
  );

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.registered',
        'Pendaftaran seller baru',
        'Toko "' || NEW.name || '" mendaftar sebagai seller dan menunggu verifikasi admin.',
        NEW.id,
        'admin_seller:registered:' || NEW.id::text,
        'store:' || NEW.id::text,
        v_action,
        v_meta,
        NULL
      );
    ELSIF NEW.status = 'active' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.auto_approved',
        'Seller baru aktif otomatis',
        'Toko "' || NEW.name || '" aktif otomatis sesuai pengaturan persetujuan marketplace.',
        NEW.id,
        'admin_seller:auto_approved:' || NEW.id::text,
        'store:' || NEW.id::text,
        v_action,
        v_meta,
        NULL
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: periksa perubahan status terlebih dahulu.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.status = 'rejected' AND NEW.status = 'pending' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.reapplied',
        'Pengajuan ulang seller',
        'Toko "' || NEW.name || '" mengajukan peninjauan ulang dan menunggu pemeriksaan admin.',
        NEW.id,
        'admin_seller:reapplied:' || NEW.id::text || ':' || v_bucket,
        'store:' || NEW.id::text,
        v_action,
        v_meta || jsonb_build_object('previous_status', OLD.status),
        NULL
      );
    ELSIF OLD.status = 'pending' AND NEW.status = 'active' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.status_approved',
        'Seller disetujui',
        'Pengajuan toko "' || NEW.name || '" telah disetujui dan berstatus aktif.',
        NEW.id,
        'admin_seller:status_approved:' || NEW.id::text || ':' || v_bucket,
        'store:' || NEW.id::text,
        v_action,
        v_meta || jsonb_build_object('previous_status', OLD.status),
        v_actor
      );
    ELSIF OLD.status = 'pending' AND NEW.status = 'rejected' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.status_rejected',
        'Pengajuan seller ditolak',
        'Pengajuan toko "' || NEW.name || '" ditolak pada tahap verifikasi.',
        NEW.id,
        'admin_seller:status_rejected:' || NEW.id::text || ':' || v_bucket,
        'store:' || NEW.id::text,
        v_action,
        v_meta || jsonb_build_object('previous_status', OLD.status),
        v_actor
      );
    ELSIF NEW.status = 'suspended' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.status_suspended',
        'Toko seller ditangguhkan',
        'Toko "' || NEW.name || '" ditangguhkan dan tidak lagi tayang di marketplace.',
        NEW.id,
        'admin_seller:status_suspended:' || NEW.id::text || ':' || v_bucket,
        'store:' || NEW.id::text,
        v_action,
        v_meta || jsonb_build_object('previous_status', OLD.status),
        v_actor
      );
    ELSIF OLD.status = 'suspended' AND NEW.status = 'active' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.status_reactivated',
        'Toko seller diaktifkan kembali',
        'Toko "' || NEW.name || '" telah diaktifkan kembali setelah masa penangguhan.',
        NEW.id,
        'admin_seller:status_reactivated:' || NEW.id::text || ':' || v_bucket,
        'store:' || NEW.id::text,
        v_action,
        v_meta || jsonb_build_object('previous_status', OLD.status),
        v_actor
      );
    ELSIF NEW.status = 'pending' THEN
      PERFORM public.notify_seller_admins(
        'admin_seller.status_pending',
        'Seller menunggu verifikasi',
        'Toko "' || NEW.name || '" berpindah ke status menunggu verifikasi admin.',
        NEW.id,
        'admin_seller:status_pending:' || NEW.id::text || ':' || v_bucket,
        'store:' || NEW.id::text,
        v_action,
        v_meta || jsonb_build_object('previous_status', OLD.status),
        NULL
      );
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE tanpa perubahan status: hanya catat perubahan informasi penting toko.
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    v_changed := array_append(v_changed, 'nama toko');
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    v_changed := array_append(v_changed, 'deskripsi');
  END IF;
  IF NEW.contact_phone IS DISTINCT FROM OLD.contact_phone THEN
    v_changed := array_append(v_changed, 'telepon kontak');
  END IF;
  IF NEW.contact_email IS DISTINCT FROM OLD.contact_email THEN
    v_changed := array_append(v_changed, 'email kontak');
  END IF;

  IF array_length(v_changed, 1) IS NOT NULL THEN
    -- Catat hanya nama kolom yang berubah (tanpa menyalin nilai kontak privat).
    PERFORM public.notify_seller_admins(
      'admin_seller.profile_updated',
      'Profil toko seller diperbarui',
      'Toko "' || NEW.name || '" memperbarui ' || array_to_string(v_changed, ', ') || '.',
      NEW.id,
      'admin_seller:profile_updated:' || NEW.id::text || ':' || v_bucket || ':' ||
        substr(md5(array_to_string(v_changed, ',') || ':' || COALESCE(NEW.name, '')), 1, 8),
      'store:' || NEW.id::text,
      v_action,
      v_meta || jsonb_build_object('changed_fields', to_jsonb(v_changed)),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_admin_store_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stores_admin_seller_notify ON public.stores;
CREATE TRIGGER stores_admin_seller_notify
  AFTER INSERT OR UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admin_store_events();

-- 5) TRIGGER PENGAJUAN MODERASI PRODUK SELLER (`public.digital_products`) ----
CREATE OR REPLACE FUNCTION public.trg_notify_admin_seller_product_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_bucket text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
BEGIN
  IF NEW.store_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.moderation_status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.moderation_status IS NOT DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT id, name, slug, is_platform
    INTO v_store
    FROM public.stores
   WHERE id = NEW.store_id;

  IF NOT FOUND OR COALESCE(v_store.is_platform, false) THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_seller_admins(
    'admin_seller.product_submitted',
    'Produk seller perlu moderasi',
    'Toko "' || v_store.name || '" mengajukan produk "' || NEW.name || '" untuk ditinjau.',
    v_store.id,
    'admin_seller:product_submitted:' || NEW.id::text || ':' || v_bucket,
    'digital_product:' || NEW.id::text,
    '/admin/seller/' || v_store.id::text,
    jsonb_build_object(
      'store_id', v_store.id,
      'store_name', v_store.name,
      'store_slug', v_store.slug,
      'product_id', NEW.id,
      'entity_name', NEW.name,
      'moderation_url', '/admin/seller/produk'
    ),
    NULL
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_admin_seller_product_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS digital_products_admin_seller_notify ON public.digital_products;
CREATE TRIGGER digital_products_admin_seller_notify
  AFTER INSERT OR UPDATE OF moderation_status ON public.digital_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admin_seller_product_events();

-- 6) TRIGGER PENGAJUAN MODERASI JASA SELLER (`public.marketplace_services`) --
CREATE OR REPLACE FUNCTION public.trg_notify_admin_seller_service_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_bucket text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
BEGIN
  IF NEW.store_id IS NULL OR NEW.status <> 'in_review' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'in_review' THEN
    RETURN NEW;
  END IF;

  SELECT id, name, slug, is_platform
    INTO v_store
    FROM public.stores
   WHERE id = NEW.store_id;

  IF NOT FOUND OR COALESCE(v_store.is_platform, false) THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_seller_admins(
    'admin_seller.service_submitted',
    'Jasa seller perlu moderasi',
    'Toko "' || v_store.name || '" mengajukan jasa "' || NEW.name || '" untuk ditinjau.',
    v_store.id,
    'admin_seller:service_submitted:' || NEW.id::text || ':' || v_bucket,
    'marketplace_service:' || NEW.id::text,
    '/admin/seller/' || v_store.id::text,
    jsonb_build_object(
      'store_id', v_store.id,
      'store_name', v_store.name,
      'store_slug', v_store.slug,
      'service_id', NEW.id,
      'entity_name', NEW.name,
      'moderation_url', '/admin/seller/jasa'
    ),
    NULL
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_admin_seller_service_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS marketplace_services_admin_seller_notify ON public.marketplace_services;
CREATE TRIGGER marketplace_services_admin_seller_notify
  AFTER INSERT OR UPDATE OF status ON public.marketplace_services
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admin_seller_service_events();

-- ============================================================================
-- ROLLBACK MANUAL (jika diperlukan):
--   DROP TRIGGER IF EXISTS marketplace_services_admin_seller_notify ON public.marketplace_services;
--   DROP TRIGGER IF EXISTS digital_products_admin_seller_notify ON public.digital_products;
--   DROP TRIGGER IF EXISTS stores_admin_seller_notify ON public.stores;
--   DROP FUNCTION IF EXISTS public.trg_notify_admin_seller_service_events();
--   DROP FUNCTION IF EXISTS public.trg_notify_admin_seller_product_events();
--   DROP FUNCTION IF EXISTS public.trg_notify_admin_store_events();
--   DROP FUNCTION IF EXISTS public.notify_seller_admins(text, text, text, uuid, text, text, text, jsonb, uuid);
--   DROP INDEX IF EXISTS public.idx_notifications_recipient_unread;
--   DROP INDEX IF EXISTS public.idx_notifications_recipient_type_created;
--   DROP INDEX IF EXISTS public.uq_notifications_recipient_dedupe;
--   ALTER TABLE public.notifications
--     DROP COLUMN IF EXISTS metadata,
--     DROP COLUMN IF EXISTS action_url,
--     DROP COLUMN IF EXISTS event_ref,
--     DROP COLUMN IF EXISTS dedupe_key;
-- ============================================================================
