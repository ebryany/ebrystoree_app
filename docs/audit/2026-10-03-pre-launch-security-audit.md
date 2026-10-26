# EBRYSTORE PRE-LAUNCH SECURITY AUDIT

Tanggal: 2026-10-03. Role: Senior Application Security Engineer, Marketplace Security Reviewer, Backend Security Auditor, Business Logic Abuse Reviewer.

Metode: source-code review, arsitektur trust boundary, audit live read-only terhadap database (RLS, policy, grant, fungsi SECURITY DEFINER), dan konfigurasi. Tidak ada tindakan destruktif, tidak ada data pengguna nyata yang diambil, tidak ada persistence.

Fokus: **small vulnerability, high impact**.

---

## RINGKASAN

Ditemukan **2 temuan High** dan **3 temuan Medium** yang nyata dengan bukti query, plus beberapa area yang eksplisit **NOT VERIFIED**.

Fondasi keamanan transaksi sangat kuat: harga selalu dihitung backend, RPC uang punya row lock dan idempotency key, tidak ada policy tulis pada tabel uang, tidak ada bucket publik, dan isolasi seller memakai `my_store_id()`.

Dua temuan High berasal dari **satu asumsi kecil yang salah**: bahwa UI adalah satu-satunya jalur tulis. Karena klien dapat memanggil PostgREST langsung dengan JWT-nya sendiri, RLS dan column grant menjadi satu-satunya batas, dan di dua tempat batas itu tidak menutup kolom sensitif.

---

## LAUNCH BLOCKERS

### BLOCKER-1: Seller dapat mengaktifkan kembali tokonya yang di-suspend (privilege escalation)

**COMPONENT**
Tabel `public.stores`, policy `stores_update_own`, dan grant kolom untuk role `authenticated`.

**EVIDENCE**
```
Policy: stores_update_own
  FOR UPDATE TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid())
```
Policy hanya memeriksa kepemilikan baris, **tidak membatasi kolom**. Grant kolom terverifikasi:
```
information_schema.column_privileges
  table=stores, grantee=authenticated, privilege=UPDATE
  → status, is_platform, reviewed_by, reviewed_at, suspended_reason, owner_id, slug, ...
```
Trigger pada `stores` hanya `stores_set_updated_at`. Tidak ada `protect_moderation_fields` untuk tabel ini, padahal trigger serupa ada untuk `digital_products`.

Server function `updateMyStore` memang hanya mengirim `name, description, logo_url, contact_phone`, tetapi itu batas **UI**, bukan batas database. Klien dapat memanggil PostgREST langsung:
```
PATCH /rest/v1/stores?id=eq.<store_id>
Authorization: Bearer <jwt milik seller>
Content-Type: application/json

{ "status": "active" }
```

**ATTACK PREREQUISITE**
Akun seller yang tokonya sedang `suspended` (atau `pending`), ditambah kemampuan mengirim request HTTP langsung (DevTools/proxy/curl). Tidak butuh akun admin.

**ATTACK PATH**
1. Admin men-suspend toko karena pelanggaran: `stores.status = 'suspended'`.
2. Seller memakai JWT sendiri memanggil PostgREST langsung ke `stores`.
3. RLS lolos karena `owner_id = auth.uid()`.
4. `status` berubah kembali menjadi `active`; `suspended_reason` dapat dikosongkan.

**IMPACT**
- Sanksi admin tidak dapat ditegakkan.
- Seller yang di-suspend dapat terus menjual.
- `is_platform` juga dapat diubah; bila ada logika yang mempercayai flag ini (mis. pengecualian biaya atau perlakuan khusus), dampaknya lebih jauh.
- `reviewed_by`/`reviewed_at` dapat dipalsukan, merusak jejak audit moderasi.

**BLAST RADIUS**
Satu seller dapat membebaskan dirinya sendiri. Jika pola ini diikuti seller lain, seluruh mekanisme penegakan marketplace kehilangan arti.

**CONFIDENCE**
Confirmed (policy + grant + tidak ada trigger pelindung, terverifikasi lewat query live).

**SEVERITY**
High.

**REMEDIATION**
1. Tambah trigger `BEFORE UPDATE` pada `stores` yang menolak perubahan kolom sensitif oleh non-admin:
   `status`, `is_platform`, `reviewed_by`, `reviewed_at`, `suspended_reason`, `owner_id`, `slug`, `created_at`.
2. Cabut grant UPDATE kolom sensitif dari `authenticated`, sisakan kolom profil saja (`name`, `description`, `logo_url`, `contact_phone`, `contact_email`).
3. Perubahan `status` hanya lewat RPC admin berizin (`sellers.approve`/`sellers.manage`).

**REGRESSION TEST**
- Sebagai seller: PATCH `status` → harus gagal atau diabaikan.
- Sebagai seller: PATCH `name` → harus berhasil.
- Sebagai admin berizin: ubah `status` → berhasil dan tercatat audit.
- Sebagai seller: PATCH `is_platform` → gagal.

---

### BLOCKER-2: Seller dapat memalsukan jumlah terjual dan harga produknya (data integrity + fraud signal)

**COMPONENT**
Tabel `public.digital_products`, policy `products_update_seller_own`, dan trigger `protect_moderation_fields`.

**EVIDENCE**
Grant kolom untuk `authenticated` mencakup:
```
sold_count, available_stock, price, discount_price, status, delivery_mode,
download_limit, validity_days, store_id, ...
```
Trigger `protect_moderation_fields` **hanya** melindungi `moderation_status`, `moderation_note`, `reviewed_by`, `reviewed_at`. Terverifikasi dari source fungsi:
```
protects sold_count: False
protects available_stock: False
protects price: False
protects status: True
```
`enforce_product_moderation` hanya menurunkan `published` menjadi `draft` bila moderasi belum approved; ia tidak melindungi `sold_count` atau `available_stock`.

**ATTACK PREREQUISITE**
Akun seller aktif dengan minimal satu produk miliknya.

**ATTACK PATH**
```
PATCH /rest/v1/digital_products?id=eq.<product_id>
Authorization: Bearer <jwt seller>
{ "sold_count": 99999, "price": 1 }
```

**IMPACT**
- `sold_count` palsu dipakai di katalog dan kartu produk sebagai sinyal kepercayaan pembeli. Ini **penipuan reputasi** langsung ke pembeli.
- `available_stock` palsu pada mode `unique`/`code` memengaruhi kesiapan stok; seller dapat menandai tersedia padahal tidak.
- `price` dapat diturunkan di luar alur yang benar, memengaruhi perhitungan tampilan dan potensi ketidaksesuaian dengan snapshot order.

Catatan penting: harga **order** tetap dihitung backend dari kolom ini, jadi menurunkan `price` di sini akan membuat order baru memakai harga palsu yang menguntungkan pembeli, bukan seller. Ini juga merugikan seller sendiri, tetapi tetap integritas data yang rusak.

**BLAST RADIUS**
Seluruh pembeli yang melihat produk tersebut. Jika dilakukan massal, kepercayaan katalog runtuh.

**CONFIDENCE**
Confirmed (grant kolom + isi trigger terverifikasi).

**SEVERITY**
High.

**REMEDIATION**
1. Perluas `protect_moderation_fields` untuk melindungi `sold_count` dan `available_stock` dari non-admin (kolom ini hanya boleh berubah lewat RPC transaksi).
2. Cabut grant UPDATE kolom `sold_count` dari `authenticated`.
3. Pertahankan `price` dapat diubah seller (memang haknya), tetapi catat perubahan harga ke audit log.

**REGRESSION TEST**
- Seller PATCH `sold_count` → ditolak/diabaikan.
- Seller PATCH `available_stock` → ditolak.
- Seller PATCH `price` → berhasil dan tercatat audit.
- Alur pembelian normal tetap menaikkan `sold_count` lewat RPC.

---

## HIGH-IMPACT / LOW-COMPLEXITY FINDINGS

### FINDING-3: Tidak ada rate limit pada login, register, dan reset password (Medium)

**COMPONENT**
`src/routes/auth.tsx`, `src/lib/rate-limit.server.ts`.

**EVIDENCE**
Rate limit hanya didefinisikan untuk bucket: `inquiry.create`, `inquiry.message`, `order.create`, `payment.proof`, `refund.request`, `qris.create`, `seller.apply`, `seller.product`, `admin.seller.decision`, `po.create`, `po.message`.

Bucket live yang tercatat: `['inquiry.create','inquiry.message','order.create','payment.proof','seller.product']`.

`auth.tsx` memanggil `supabase.auth.signInWithPassword` dan `supabase.auth.signUp` **langsung dari klien**, tanpa pembatasan aplikasi.

**ATTACK PREREQUISITE**
Akses jaringan ke endpoint auth.

**ATTACK PATH**
Brute force password atau credential stuffing bergantung pada batas bawaan Supabase (yang tidak dapat diverifikasi dari repo ini).

**IMPACT**
Bergantung konfigurasi Supabase. Bila batas bawaan longgar, akun dengan password lemah dapat diambil alih.

**BLAST RADIUS**
Semua akun.

**CONFIDENCE**
Needs runtime validation (batas Supabase tidak terlihat dari source).

**SEVERITY**
Medium.

**REMEDIATION**
Aktifkan proteksi brute force di dashboard Supabase (rate limit auth) dan tambahkan pembatasan aplikasi untuk `resetPasswordForEmail` bila memakai alur kustom.

**REGRESSION TEST**
Uji 20 percobaan login gagal berturut-turut: harus ada pembatasan.

---

### FINDING-4: `create_digital_order` tidak memblokir pembelian dari toko sendiri (Medium)

**COMPONENT**
RPC `public.create_digital_order(uuid, integer, text, text)`.

**EVIDENCE**
Fungsi memeriksa `UNAUTHENTICATED`, `has_permission(orders.create)`, ketersediaan produk, dan `STORE_SUSPENDED`. Verifikasi pola:
```
create_digital_order  self_block=False  self_err=False
create_marketplace_service_order  self_block=True  self_err=True
```
Kontras dengan jasa seller yang memang memblokir self-purchase (`SELF_PURCHASE_DENIED`).

**ATTACK PREREQUISITE**
Seller dengan produk digital sendiri.

**ATTACK PATH**
Seller memesan produknya sendiri. Karena harga dihitung backend, ia membayar harga sendiri + biaya admin, lalu berpotensi memicu pelepasan dana ke ledger tokonya.

**IMPACT**
- `sold_count` naik palsu (memperkuat FINDING-2).
- Bila ada jalur pelepasan dana otomatis, seller dapat memindahkan uang ke dirinya sendiri dengan kerugian sebesar biaya admin (atau lebih kecil bila ada kebijakan lain).
- Membuka celah pencucian reputasi.

**BLAST RADIUS**
Per seller, tetapi dapat dilakukan berulang.

**CONFIDENCE**
Confirmed (source RPC).

**SEVERITY**
Medium.

**REMEDIATION**
Tambahkan guard pada `create_digital_order`: bila `v_p.store_id` milik `v_user`, `RAISE EXCEPTION 'SELF_PURCHASE_DENIED'` — konsisten dengan jalur jasa.

**REGRESSION TEST**
Seller memesan produknya sendiri → ditolak. Pembeli lain → berhasil.

---

### FINDING-5: `submit_payment_proof` dapat dipanggil `authenticated` (perlu verifikasi batas baris) (Medium)

**COMPONENT**
RPC `public.submit_payment_proof`.

**EVIDENCE**
Grant: `authenticated` dan `service_role`. Perlu dipastikan RPC memeriksa kepemilikan payment sebelum menyimpan bukti. Dari pembacaan migration boundary, fungsi memeriksa `payment.user_id` dan status, tetapi verifikasi menyeluruh belum saya lakukan pada seluruh cabang.

**ATTACK PREREQUISITE**
Akun terautentikasi.

**ATTACK PATH**
Memanggil RPC dengan `payment_id` milik orang lain; bila pemeriksaan kepemilikan tidak lengkap, penyerang dapat menyisipkan bukti palsu ke pembayaran korban.

**IMPACT**
Bila benar: gangguan pembayaran korban, potensi kebingungan verifikasi manual.

**BLAST RADIUS**
Per payment.

**CONFIDENCE**
Needs runtime validation.

**SEVERITY**
Medium.

**REMEDIATION**
Verifikasi ulang cabang fungsi dan tambahkan test kepemilikan eksplisit.

**REGRESSION TEST**
User A memanggil `submit_payment_proof` dengan payment milik User B → harus `NOT_FOUND`.

---

## AUTH & ACCESS CONTROL FINDINGS

Yang sudah kuat (terverifikasi):
- `orders`, `payments`, `digital_entitlements`, `download_logs`, `refunds`, `credit_ledger`, `manual_payment_proofs` hanya punya policy SELECT untuk pemilik atau staf berizin. **Tidak ada policy tulis.**
- `user_roles` hanya dapat ditulis oleh `roles.manage`.
- `profiles` tidak menyimpan kolom role; UPDATE hanya untuk kolom profil.
- `marketplace_services` tidak punya grant tulis untuk `authenticated` (hanya SELECT); semua tulis lewat RPC.
- Isolasi seller memakai `my_store_id()` dan `can_access_store()` pada fungsi finansial.
- IDOR pada order/payment/entitlement tertutup oleh kombinasi RLS + parameter kepemilikan di RPC (`user_id = auth.uid()`).

Lihat BLOCKER-1 dan BLOCKER-2 untuk dua celah nyata.

---

## PAYMENT FINDINGS

Yang sudah kuat (terverifikasi):
- Webhook memverifikasi token **atau** signature HMAC Svix; gagal verifikasi mengembalikan 401.
- `settle_gateway_payment` **hanya** dapat dipanggil `service_role`; `authenticated` tidak punya grant.
- `settle_gateway_payment` memeriksa `_paid_amount < expected_amount` → `AMOUNT_MISMATCH`.
- Status `paid` bersifat idempoten (`already_settled`).
- `verify_manual_payment` memerlukan permission `payments.verify`/`payments.reject`, memeriksa `amount_claimed = expected_amount`, dan memvalidasi path bukti.
- `credit_refund_to_balance` memakai idempotency key `refund:<id>` dan memerlukan `refunds.process`.
- `request_refund`, `review_refund`, `process_refund` memakai `FOR UPDATE` dan guard duplikasi.

Catatan: endpoint webhook sudah dibatasi ukuran body 64 KB.

---

## FILE / DIGITAL PRODUCT FINDINGS

Yang sudah kuat (terverifikasi):
- Tidak ada bucket publik; seluruh bucket privat.
- `product-files` policy hanya untuk `products.update` (admin).
- `service-deliveries` dan `service-media` memakai policy berbasis keanggotaan pesanan.
- `consume_download` memeriksa `user_id`, `revoked_at`, `valid_until`, dan `download_limit` sebelum melayani.
- `get_my_stock_code` memeriksa kepemilikan dan status kode.
- `claim_stock_code` **tidak** memeriksa kepemilikan, tetapi hanya diberikan ke `service_role` dan hanya dipanggil fungsi internal (`assign_stock_codes_for_order`, `fulfill_waiting_stock_orders`), sehingga tidak dapat dipanggil `authenticated` maupun `anon`. Bukan celah aktif, tetapi sebaiknya diberi guard tetap sebagai pertahanan berlapis.

---

## INFRASTRUCTURE FINDINGS

- Security header aktif: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy (terverifikasi pada respons live).
- Grant tulis `anon` sudah dicabut dari seluruh 50 tabel; hanya 3 fungsi publik yang dapat dipanggil `anon`.
- Semua fungsi SECURITY DEFINER memiliki `search_path` eksplisit (0 tersisa).
- Tidak ada bucket publik.
- Batas ukuran dan MIME ditetapkan pada seluruh bucket.

---

## BUSINESS LOGIC FINDINGS

Selain BLOCKER-1, BLOCKER-2, FINDING-4:

- **Refund tetapi produk tetap dapat diakses.** `consume_download` memeriksa `revoked_at`. Perlu diverifikasi bahwa jalur refund benar-benar menetapkan `revoked_at`; bila tidak, pembeli yang direfund tetap dapat mengunduh. **NEEDS RUNTIME VALIDATION.**
- **Order status skipping.** Perubahan status hanya lewat RPC dengan guard; tidak ditemukan jalur langsung. Aman dari pembacaan.
- **Race condition payout/refund.** RPC terkait memakai `FOR UPDATE` dan idempotency key; tidak ditemukan celah dari source.
- **Coupon stacking / negative quantity.** Tidak ada sistem kupon. `quantity` dibatasi `GREATEST(1, LEAST(qty,10))` dan dipaksa 1 untuk mode unik/kode.

---

## DATA EXPOSURE FINDINGS

- Tidak ditemukan stack trace atau pesan database mentah yang dikembalikan ke pengguna; pesan disanitasi.
- `getOrderDetail` (admin) mengembalikan email/telepon pembeli, tetapi hanya untuk pemegang `orders.view`. Sesuai desain.
- Tidak ditemukan kunci rahasia di bundle klien (grep service role bersih).

---

## NEEDS RUNTIME VALIDATION

1. Batas brute force auth Supabase (FINDING-3).
2. Apakah `submit_payment_proof` memeriksa kepemilikan di semua cabang (FINDING-5).
3. Apakah refund benar-benar mencabut `digital_entitlements.revoked_at`.
4. Apakah ada jalur pelepasan dana otomatis yang dapat dipicu self-purchase (memperkuat FINDING-4).
5. Perilaku RLS pada operasi UPDATE kolom yang di-revoke (perlu diuji setelah remediation).
6. CORS: konfigurasi Supabase CORS tidak terlihat dari repo; perlu diperiksa di dashboard.

---

## PRE-LAUNCH SECURITY GATE

**BLOCK LAUNCH:**
- BLOCKER-1: seller dapat mengaktifkan kembali toko yang di-suspend.
- BLOCKER-2: seller dapat memalsukan `sold_count` dan `available_stock`.

**FIX BEFORE LAUNCH:**
- FINDING-3: pastikan proteksi brute force auth aktif.
- FINDING-4: blokir self-purchase pada produk digital.
- FINDING-5: verifikasi kepemilikan pada `submit_payment_proof`.
- Verifikasi bahwa refund mencabut akses produk.

**CAN FIX AFTER LAUNCH:**
- Guard tambahan pada `claim_stock_code` (defense in depth; saat ini tidak terekspos).
- Audit log untuk perubahan harga seller.

**UNKNOWN / NOT VERIFIED:**
- Konfigurasi rate limit dan CORS di dashboard Supabase.
- Perilaku runtime RLS setelah remediation kolom.
- Cakupan test keamanan otomatis (belum ada security regression suite).

---

## CATATAN METODE

- Semua temuan berbasis query live read-only atau pembacaan source; tidak ada klaim tanpa bukti.
- Tidak ada pengujian eksploitasi yang dilakukan terhadap data nyata; jalur serangan dijelaskan sebagai metode validasi aman.
- Audit ini tidak menyatakan aplikasi 100% aman. Area yang belum diperiksa ditandai eksplisit.
