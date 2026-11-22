# Real-Time Seller Notification & Admin Event Center (`/admin/seller`)

Dokumentasi arsitektur, keamanan, integrasi backend/realtime, dan hasil pengujian untuk fitur **Real-Time Seller Notification & Admin Event Center** pada dashboard Admin Seller Ebrystore.

---

## 1. File yang Dibuat & Diubah

### File Baru
1. `supabase/migrations/20261122140000_admin_seller_notification_center.sql`
   Migrasi database aditif & backward-compatible (ekstensi `public.notifications`, indeks deduplikasi, helper `notify_seller_admins()`, publikasi realtime `notifications` & `stores`, serta trigger event bisnis seller pada `stores`, `digital_products`, dan `marketplace_services`).
2. `src/lib/admin-seller-notifications.ts`
   Modul domain murni untuk klasifikasi event seller, filter kategori (`all`, `unread`, `registration`, `verification`, `activity`), pemformatan badge (`1..99`, `99+`), validasi tujuan `/admin/seller/$id`, normalisasi payload aman, rekonsiliasi out-of-order + deduplikasi (`reconcileNotifications`), serta koordinasi anti-toast ganda (`claimNotificationToast`).
3. `src/lib/admin-seller-notifications.functions.ts`
   Server functions TanStack Start untuk list notifikasi berpaginasi & berfilter, hitung unread per kategori, menandai dibaca/belum dibaca, dan menandai seluruh kategori dibaca.
4. `src/hooks/use-admin-seller-notifications.ts`
   Hook React Query + `createAdminSellerRealtimeController` yang menangani langganan Supabase Realtime (`postgres_changes`), sinkronisasi optimistik cache React Query, debounced invalidasi tabel seller (`["admin-stores"]`, `["admin-store", id]`), reconnect otomatis, resync saat session refresh/tab kembali aktif/online kembali, dan pencegahan toast pada data lama.
5. `src/components/admin/seller-notification-center.tsx`
   Komponen UI tombol lonceng, badge `99+`, indikator status koneksi (`Live`, `Menyambung ulang…`, `Offline`), dropdown filter/paginasi, aksi `Tandai dibaca` / `Tandai belum dibaca` / `Tandai semua`, navigasi ke detail seller (`/admin/seller/$id`) atau moderasi, serta fallback live region DOM `#ebry-notif-live`.
6. `src/lib/__tests__/admin-seller-notifications.test.ts`
   Suite 13 pengujian mencakup kontrak migrasi SQL, skenario Test 1–9 (registrasi, verifikasi, multi-admin independence, unread persistence, deduplikasi & out-of-order, disconnect/reconnect resync, otorisasi customer/seller ditolak, navigasi aman, serta regresi `/admin/seller`).
7. `docs/seller-notification-center.md`
   Laporan implementasi dan arsitektur.

### File yang Diubah
1. `src/integrations/supabase/types.ts` — Menambahkan definisi kolom aditif `action_url`, `dedupe_key`, `event_ref`, dan `metadata` pada tabel `notifications`.
2. `src/lib/admin-seller.functions.ts` — Memperluas respons `listStoresForAdmin` secara aditif dengan ringkasan `counts` per status (`all`, `pending`, `active`, `suspended`, `rejected`).
3. `src/components/ebry/notification-meta.tsx` — Menambahkan pemetaan warna/label `admin_seller.*` dan mengarahkan `notificationHref` bertipe `store` / `admin_seller.*` milik staf berizin langsung ke `/admin/seller/$id`.
4. `src/components/ebry/notification-toast.tsx` — Menambahkan prop opsional `actionLabel`, `motion-reduce:animate-none`, penahanan toast latar belakang ketika modal dialog sedang terbuka, serta pengumuman aksesibel (`document.ariaNotify` + fallback DOM live region `#ebry-notif-live`).
5. `src/components/ebry/notification-bell.tsx` — Menggunakan `claimNotificationToast` bersama (mencegah toast ganda dengan `SellerNotificationCenter`), `formatUnreadBadge` (`99+`), serta penyesuaian tautan toast ke `/admin/seller/$id` untuk event seller admin.
6. `src/routes/_authenticated/admin/seller.index.tsx` — Memasang `<SellerNotificationCenter />` pada `<AdminPageHeader />`, badge hitungan status per tab filter, indikator pending verification, kolom pencarian dengan `useDeferredValue`, serta paginasi `20` item per halaman dengan `placeholderData: keepPreviousData`.
7. `src/routes/_authenticated/admin/seller.$id.tsx` — Memasang `<SellerNotificationCenter />` pada `<AdminPageHeader />` di halaman detail seller.

---

## 2. Database Migration & Rollback

- **Lokasi file**: `supabase/migrations/20261122140000_admin_seller_notification_center.sql`
- **Status penerapan ke produksi**: **Telah diterapkan & diverifikasi pada project Supabase produksi (`wcxaheqnnsbhifpgiedk`)** dengan verifikasi katalog DB (`cols_count=4`, `idx_count=3`, `fn_count=4`, `trg_count=3`, `pub_count=2`) serta smoke test trigger ber-rollback (`exp=3`, `after_insert=3`, `after_dup=3`, `leftover_stores=0`, `leftover_notifs=0`).
- **Perubahan skema (`public.notifications`)**:
  - Kolom aditif nullable/defaulted: `dedupe_key text`, `event_ref text`, `action_url text`, `metadata jsonb NOT NULL DEFAULT '{}'::jsonb`.
  - Unique partial index: `uq_notifications_recipient_dedupe ON public.notifications (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL` untuk jaminan idempotensi pada database.
  - Indeks query: `idx_notifications_recipient_type_created` dan `idx_notifications_recipient_unread`.
  - `ALTER TABLE public.stores REPLICA IDENTITY FULL` + penambahan idempoten ke `publication supabase_realtime` untuk `notifications` dan `stores`.
- **Rollback**: Blok perintah SQL rollback lengkap tersedia di bagian komentar akhir file migrasi (`DROP TRIGGER`, `DROP FUNCTION`, `DROP INDEX`, `ALTER TABLE ... DROP COLUMN`).

---

## 3. Taksonomi Business Event Seller yang Didukung

Seluruh event dipicu secara **server-authoritative** langsung melalui trigger PostgreSQL tanpa menerima payload event dari browser:

| Kategori Filter UI | Tipe Event (`notifications.type`) | Tabel & Kondisi Pemicu | Tujuan Aksi |
|---|---|---|---|
| **Seller baru** (`registration`) | `admin_seller.registered` | `stores` INSERT (`status = 'pending'`, non-platform) | `/admin/seller/$id` |
| **Seller baru** (`registration`) | `admin_seller.auto_approved` | `stores` INSERT (`status = 'active'`, non-platform) | `/admin/seller/$id` |
| **Verifikasi** (`verification`) | `admin_seller.reapplied` | `stores` UPDATE (`rejected -> pending`) | `/admin/seller/$id` |
| **Verifikasi** (`verification`) | `admin_seller.status_approved` | `stores` UPDATE (`pending -> active`) | `/admin/seller/$id` |
| **Verifikasi** (`verification`) | `admin_seller.status_rejected` | `stores` UPDATE (`pending -> rejected`) | `/admin/seller/$id` |
| **Verifikasi** (`verification`) | `admin_seller.status_suspended` | `stores` UPDATE (`* -> suspended`) | `/admin/seller/$id` |
| **Verifikasi** (`verification`) | `admin_seller.status_reactivated` | `stores` UPDATE (`suspended -> active`) | `/admin/seller/$id` |
| **Verifikasi** (`verification`) | `admin_seller.status_pending` | `stores` UPDATE ke `pending` selain jalur reapply | `/admin/seller/$id` |
| **Aktivitas seller** (`activity`) | `admin_seller.profile_updated` | `stores` UPDATE pada `name`, `description`, `contact_phone`, atau `contact_email` (hanya mencatat nama kolom, **bukan** nilai PII kontak) | `/admin/seller/$id` |
| **Aktivitas seller** (`activity`) | `admin_seller.product_submitted` | `digital_products` masuk ke `moderation_status = 'pending'` | `/admin/seller/$id` & tautan `/admin/seller/produk` |
| **Aktivitas seller** (`activity`) | `admin_seller.service_submitted` | `marketplace_services` masuk ke `status = 'in_review'` | `/admin/seller/$id` & tautan `/admin/seller/jasa` |

*(Catatan: `CLASSIFICATION_MAP` juga mendukung klasifikasi `admin_seller.compliance_flagged` bila suatu kebijakan moderasi otomatis ditambahkan pada migrasi berikutnya.)*

---

## 4. Arsitektur Realtime & Keandalan Pengiriman

1. **Aliran End-to-End**:
   Mutasi seller (`apply_as_seller`, `updateMyStore`, `saveMyProduct`, `submit_product_for_review`, `save_marketplace_service_draft` / moderasi) → Trigger PostgreSQL → `notify_seller_admins()` insert per admin dengan `ON CONFLICT DO NOTHING` → `public.notifications` → Supabase Realtime (`postgres_changes`, filter `recipient_id=eq.<userId>`) → `createAdminSellerRealtimeController` → React Query Cache + Toast + Invalidate tabel seller (debounced 250ms).
2. **Multi-Admin Independen**:
   Setiap akun staf berizin menerima baris notifikasinya masing-masing di `public.notifications`. Mengubah `read_at` Admin A tidak pernah memengaruhi status belum dibaca milik Admin B.
3. **Anti-Duplikasi & Anti-Toast Lama**:
   - Database menolak duplikat melalui `uq_notifications_recipient_dedupe`.
   - Client mencatat seluruh ID initial fetch pada `initialIdsRef` sehingga notifikasi lama saat baru membuka halaman **tidak** memunculkan toast.
   - `claimNotificationToast(id)` mencegah toast ganda antara `<NotificationBell />` di layout admin global dan `<SellerNotificationCenter />` di `/admin/seller`.
   - `reconcileNotifications()` menjaga urutan ketat `createdAt DESC` saat event tiba tidak berurutan.
4. **Reconnect & Pemulihan Gap**:
   Ketika status channel berubah ke `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED`, jaringan sempat offline lalu kembali online, tab kembali aktif setelah tersembunyi `>= 20 detik`, atau token diperbarui (`TOKEN_REFRESHED`), controller otomatis menjadwalkan `invalidateQueries` untuk menyinkronkan notifikasi maupun daftar seller yang mungkin tertinggal. Bila koneksi realtime putus total, panel notifikasi tetap dapat dipakai via fetch & tombol refresh manual.

---

## 5. Model Permission & Keamanan

- **Otorisasi Server-Side**: Seluruh RPC/Server Function di `admin-seller-notifications.functions.ts` memakai `requireSupabaseAuth` + `assertPermission(ctx, "sellers.view")` menggunakan JWT user (`ctx.supabase`). Akun customer maupun seller biasa menerima `{ forbidden: true }` dan nol baris notifikasi.
- **Isolasi RLS**: Kebijakan `notifications_select_own` & `notifications_update_own` (`recipient_id = auth.uid()`) memastikan tidak ada pengguna yang dapat membaca atau memanipulasi `read_at` milik admin lain, termasuk melalui Supabase Realtime `postgres_changes` dengan filter `recipient_id=eq.<userId>`.
- **Server-Only Creation**: `notify_seller_admins()` bersifat `SECURITY DEFINER` dengan `REVOKE ALL FROM PUBLIC, anon, authenticated`. Tidak ada endpoint browser yang dapat memalsukan notifikasi bisnis seller.
- **Minimisasi Data & Sanitasi Tautan**: Data kontak sensitif (`contact_phone`, `contact_email`) tidak pernah disalin ke pesan atau metadata notifikasi. Tautan tujuan divalidasi dengan `safeInternalPath` agar selalu merujuk rute internal `/admin/seller*`.

---

## 6. Hasil Verifikasi & Pengujian

Seluruh pengujian dijalankan setelah suntingan kode terakhir:

- **Typecheck**: `npx tsc --noEmit` — **Lulus (exit code 0)**
- **Unit & Integration Test Suite**: `npx vitest run` — **Lulus 62/62 file test, 727/727 test** (durasi 36.81s), termasuk **13/13 test** pada `src/lib/__tests__/admin-seller-notifications.test.ts` (kontrak migrasi SQL, Test 1–9: klasifikasi event, badge `99+`, validasi tautan & missing store, deduplikasi & out-of-order, penolakan customer/seller, independensi multi-admin & persistensi `read_at`, simulasi realtime `INSERT`/`reconnect`, `listStoresForAdmin` counts, serta SSR render `<SellerNotificationCenter />`), plus 10/10 `use-realtime-refresh.test.ts` dan 17/17 `regression-fase0.test.ts`.
- **Production Build**: `$env:NITRO_PRESET='node-server'; npm run build` — **Lulus (exit code 0, built in 9.45s, `.output/nitro.json` terbit)**.

---

## 7. Known Limitations

1. **Verifikasi WebSocket Browser Live End-to-End**: Kontrak SQL trigger & deduplikasi sudah diuji di database Supabase produksi (via transaksi ber-rollback), dan aliran subscription/reconnect `createAdminSellerRealtimeController` + `QueryClient` sudah diuji melalui simulasi di Vitest Node; pengujian browser Playwright terhadap WebSocket live masih bergantung pada skrip E2E bila dijalankan terhadap akun admin & seller aktif secara bersamaan.
2. **Event Kepatuhan Otomatis (`admin_seller.compliance_flagged`)**: Sudah didukung di lapisan domain dan UI (`CLASSIFICATION_MAP` & filter `Aktivitas seller`), namun belum ada tabel aturan pelanggaran/moderasi otomatis tersendiri di schema existing di luar `stores`, `digital_products`, dan `marketplace_services`.
3. **Pengajuan Ulang Saat Produk Diedit**: Trigger `digital_products_admin_seller_notify` aktif ketika `moderation_status` masuk ke `pending` dari status lain atau saat insert baru (`moderation_status = 'pending'`), bukan untuk setiap penyimpanan draft rutin sebelum diajukan review agar admin tidak menerima spam notifikasi.
