# Ebrystore Seller Onboarding & Approval — Business Logic Audit

Tanggal: 2026-10-06 · Mode: **Audit Only — Read-Only** (uji memakai akun sintetis, sudah dihapus)
Cakupan: `apply_as_seller` → `stores` → `review_seller` → `user_roles` → akses `/seller`

---

## A. Executive Summary

**Alur seller onboarding berfungsi, tetapi punya tiga lubang serius.**

Yang **sudah benar dan terbukti**:

| Kontrol | Bukti |
|---|---|
| Role tidak diberikan saat pengajuan | `apply_as_seller` tidak menyentuh `user_roles` |
| Concurrent approval aman | `FOR UPDATE` pada `stores`; request kedua → `INVALID_STATE` |
| Escalation role sendiri diblokir | `protect_role_changes`: `NEW.user_id = auth.uid()` → exception |
| Seller tidak bisa ubah status toko sendiri | `protect_store_privileged_fields` + REVOKE kolom (migrasi 20261004090000) |
| Satu toko per akun ditegakkan DB | `stores_owner_unique` |

Yang **bermasalah**:

1. **Suspend toko tidak mencabut role seller.** Seller yang di-suspend tetap punya 5 permission
   seller dan **terbukti masih bisa membuat produk** serta melihat saldo.
2. **Status `rejected` adalah dead-end.** User yang ditolak tidak bisa mengajukan ulang
   selamanya — `apply_as_seller` mengembalikan `duplicate: true` dengan status lama.
3. **Race pada pengajuan** menghasilkan error PostgreSQL mentah (`23505`), bukan pesan domain.

**Tidak terverifikasi:** kegagalan parsial antara `UPDATE stores` dan `INSERT user_roles`
(tidak bisa dipicu tanpa mengubah kode), dan perilaku bila `owner_id` menunjuk user terhapus.

---

## B. Seller Lifecycle & State Transition Matrix

Status yang benar-benar ada (constraint `stores.status`):
`pending` · `active` · `suspended` · `rejected`

| # | Status awal | Aksi | Status tujuan | Aktor | Validasi | Hasil audit |
|---|---|---|---|---|---|---|
| 1 | *(tidak ada)* | `apply_as_seller` | `pending` | customer | nama ≥3, slug ≥3, slug unik, satu toko/akun | **Valid**, kecuali race (SELLER-BL-003) |
| 2 | `pending` | `review_seller(approve)` | `active` | `sellers.approve` | `FOR UPDATE` + status harus `pending` | **Valid** |
| 3 | `pending` | `review_seller(reject)` | `rejected` | `sellers.approve` | idem + alasan ≥5 | **Valid** |
| 4 | `active` | `set_seller_suspended(true)` | `suspended` | `sellers.manage` | status harus `active` | **Valid status**, tapi role tidak dicabut (**SELLER-BL-001**) |
| 5 | `suspended` | `set_seller_suspended(false)` | `active` | `sellers.manage` | status harus `suspended` | **Valid** |
| 6 | `rejected` | `apply_as_seller` | — | customer | — | **DEAD-END**: `duplicate:true`, tetap `rejected` (**SELLER-BL-002**) |
| 7 | `active` | `review_seller` | — | `sellers.approve` | status ≠ `pending` | **Ditolak** `INVALID_STATE` ✅ |
| 8 | `suspended` | `review_seller` | — | `sellers.approve` | status ≠ `pending` | **Ditolak** `INVALID_STATE` ✅ |
| 9 | `rejected` | `review_seller` | — | `sellers.approve` | status ≠ `pending` | **Ditolak** `INVALID_STATE` ✅ |
| 10 | `active` | `apply_as_seller` | — | customer | sudah punya toko | **`duplicate:true`** ✅ |

**Transisi yang tidak ada (gap):**
- `rejected → pending` (ajukan ulang) — **tidak ada**
- `suspended → rejected` — tidak ada (mungkin tidak perlu)
- Pencabutan role saat `active → suspended` — **tidak ada**

---

## C. Business Logic Findings

### SELLER-BL-001 — Suspend toko tidak mencabut role seller

| Field | Isi |
|---|---|
| **Severity** | **High** |
| **Business rule** | Toko yang ditangguhkan tidak boleh lagi menjalankan operasi seller |
| **Actual implementation** | `set_seller_suspended` hanya `UPDATE stores SET status`. `user_roles` tidak disentuh. Role `seller` tetap ada, 5 permission tetap aktif |
| **Evidence** | `20260930100011_seller_onboarding.sql:109-133` (tidak ada operasi `user_roles`)<br>**Uji langsung**: suspend toko → `user_roles` masih `['customer','seller']`; `get_my_permissions` masih mengembalikan `seller.products.manage`, `seller.earnings.view`, dll.<br>**Uji lanjutan**: INSERT `digital_products` sebagai seller suspended → **berhasil** (201) |
| **Root cause** | Status toko dan role adalah dua sumber kebenaran terpisah. `set_seller_suspended` hanya mengurus yang pertama. Tidak ada trigger/constraint yang menyinkronkan |
| **Business impact** | Seller yang di-suspend karena pelanggaran tetap bisa menyiapkan produk, melihat saldo, dan membaca pesanan. Sanksi admin tidak efektif. Jika produk disetujui admin lain, bisa tayang kembali |
| **Recommendation** | Saat suspend: cabut role `seller` (atau tambah pengecekan `stores.status='active'` di setiap policy seller). Saat aktifkan kembali: berikan ulang. Harus dalam satu transaksi |
| **Verification** | **VERIFIED** (uji langsung di DB) |

---

### SELLER-BL-002 — Status `rejected` adalah dead-end permanen

| Field | Isi |
|---|---|
| **Severity** | **High** |
| **Business rule** | Seller yang ditolak harus bisa memperbaiki dan mengajukan ulang (kecuali keputusan produk menyatakan blacklist permanen) |
| **Actual implementation** | `apply_as_seller` menemukan toko yang sudah ada → langsung `RETURN duplicate:true` dengan status lama, apa pun statusnya. Tidak ada jalur `rejected → pending` |
| **Evidence** | `20260930100012_seller_role_on_approval.sql:20-24`<br>**Uji langsung**: ajukan → reject → ajukan ulang → hasil `{"status":"rejected","store_id":"…","duplicate":true}`<br>`grep` seluruh migrasi: tidak ada `UPDATE stores SET status='pending'` |
| **Root cause** | Pengecekan duplikat dilakukan sebelum memeriksa status. Tidak ada alur "ajukan ulang" yang dirancang |
| **Business impact** | Sekali ditolak = tidak bisa berjualan selamanya. Tidak ada cara admin membuka kembali selain SQL manual. Ini juga membuat kesalahan admin tidak bisa dikoreksi |
| **Recommendation** | Ubah `apply_as_seller`: bila status `rejected`, izinkan reset ke `pending` + perbarui data + buat task review baru. Alternatif: tambah RPC admin `reopen_seller_application` |
| **Verification** | **VERIFIED** (uji langsung) |

---

### SELLER-BL-003 — Race condition pada pengajuan menghasilkan error mentah

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Business rule** | Pengajuan bersamaan harus menghasilkan satu toko dan pesan yang dapat dipahami |
| **Actual implementation** | `apply_as_seller` melakukan `SELECT` cek duplikat tanpa lock, lalu `INSERT`. Dua request paralel: satu berhasil, satu melempar `23505 duplicate key value violates unique constraint "stores_owner_unique"` |
| **Evidence** | `20260930100012_seller_role_on_approval.sql:20` (`SELECT * INTO v_store …` tanpa `FOR UPDATE`)<br>**Uji langsung**: 2 request paralel → `{"duplicate":false}` + `{"code":"23505", "message":"duplicate key value violates unique constraint \"stores_owner_unique\""}` |
| **Root cause** | Cek-lalu-insert tanpa serialisasi. Constraint DB menyelamatkan integritas, tetapi error tidak ditangkap |
| **Business impact** | Integritas data **aman** (tetap satu toko). Yang rusak hanya pengalaman: user melihat error teknis, bukan "pengajuan sedang diproses" |
| **Recommendation** | Tangkap `unique_violation` lalu `RETURN duplicate:true`, atau tambah `pg_advisory_xact_lock(hashtext(v_user::text))` sebelum cek |
| **Verification** | **VERIFIED** (uji langsung) |

---

### SELLER-BL-004 — `user_roles` dan `stores` tanpa FK ke `auth.users`

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Business rule** | Menghapus akun harus membersihkan data turunannya, atau ditolak |
| **Actual implementation** | `user_roles.user_id` tidak punya `REFERENCES auth.users`. `stores.owner_id` juga tidak. Saat user dihapus, role dan toko **tertinggal** |
| **Evidence** | `20260728115920_…sql:13-19` — `user_id uuid NOT NULL` tanpa FK<br>`20260930100010_…sql:63` — `owner_id uuid NOT NULL` tanpa FK<br>**Data nyata**: 3 role `seller` yatim milik user yang sudah dihapus (sisa uji sebelumnya) |
| **Root cause** | Skema dibuat tanpa integritas referensial ke `auth.users` |
| **Business impact** | Data sampah menumpuk; laporan seller bisa menghitung user yang tidak ada. Tidak memberi akses (user sudah tidak bisa login), jadi bukan celah keamanan |
| **Recommendation** | Tambah FK `ON DELETE CASCADE` untuk `user_roles`, dan `ON DELETE RESTRICT` untuk `stores` (toko tidak boleh hilang otomatis) |
| **Verification** | **VERIFIED** (skema + data) |

---

### SELLER-BL-005 — Teks UI seller pending tidak sesuai kemampuan

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Actual implementation** | UI: *"Anda dapat menyiapkan produk, tetapi belum tampil sampai toko disetujui."* Kenyataan: role `seller` belum diberikan → RLS menolak INSERT produk |
| **Evidence** | `src/routes/_authenticated/seller.tsx:155`<br>`20260930100012_…sql` (role diberikan hanya saat approve)<br>Uji: seller pending INSERT produk → `42501` |
| **Root cause** | Teks ditulis sebelum aturan role dipindah ke saat approval |
| **Business impact** | Seller mencoba, gagal, tidak tahu sebabnya |
| **Recommendation** | Pilih Opsi A atau B (lihat bagian D) |
| **Verification** | **VERIFIED** |

---

### SELLER-BL-006 — Tidak ada pencabutan role saat toko dihapus/ditolak

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Actual** | Tidak ada trigger yang mencabut role `seller` bila toko dihapus atau statusnya kembali `rejected` |
| **Evidence** | `grep` trigger pada `stores`: hanya `stores_set_updated_at` dan `stores_protect_privileged` |
| **Business impact** | Sama dengan SELLER-BL-001, tetapi jalurnya lebih jarang |
| **Recommendation** | Satu trigger `AFTER UPDATE OF status ON stores` yang menyinkronkan role |
| **Verification** | **VERIFIED** (kode) |

---

## D. Keputusan Produk yang Diperlukan

### D-1 — Seller pending: Opsi A atau Opsi B?

| Aspek | **Opsi A** (pertahankan pembatasan, perbaiki teks) | **Opsi B** (izinkan draft) |
|---|---|---|
| Perubahan kode | 1 baris teks | RLS baru + role saat apply + filter publish |
| Risiko otorisasi | Nol | Sedang: role `seller` diberikan sebelum approval |
| Pengalaman seller | Jujur, tapi tidak bisa menyiapkan apa pun | Lebih baik, tapi ada ekspektasi produk "hilang" saat ditolak |
| Dampak RLS | Tidak ada | Perlu policy khusus status `pending` |
| Dampak server fn | Tidak ada | `listMyStoreProducts` perlu filter status toko |
| Rekomendasi audit | **Opsi A** untuk MVP — perubahan terkecil, tanpa melemahkan gerbang approval | Layak dipertimbangkan setelah payout ada |

### D-2 — Apakah `rejected` boleh diajukan ulang?

Perlu keputusan: berapa kali boleh mengajukan ulang? Apakah perlu jeda? Apakah penolakan bisa bersifat permanen (blacklist)?

### D-3 — Apakah suspend harus mencabut role?

Rekomendasi audit: **ya**, tetapi perlu keputusan apakah seller yang di-suspend masih boleh login dan melihat riwayat (read-only) atau tidak sama sekali.

---

## E. Test Scenario Matrix

| ID | Precondition | Aksi | Expected | Assertion | Jenis | Status |
|---|---|---|---|---|---|---|
| TS-01 | User tanpa toko | `apply_as_seller` | `pending`, satu baris | count stores = 1 | DB | **Lulus** (implisit) |
| TS-02 | User sudah punya toko | `apply_as_seller` lagi | `duplicate:true` | tidak ada baris baru | DB | **Lulus** |
| TS-03 | Toko `pending` | 2× `review_seller(approve)` paralel | 1 sukses, 1 `INVALID_STATE` | 1 role seller | DB concurrency | **Lulus** ✅ |
| TS-04 | Toko `rejected` | `apply_as_seller` | Bisa ajukan ulang → `pending` | status berubah | DB | **GAGAL** ❌ |
| TS-05 | 2× `apply_as_seller` paralel | — | Satu sukses, satu pesan ramah | tidak ada `23505` mentah | DB concurrency | **GAGAL** ❌ |
| TS-06 | Toko `active` + role seller | `set_seller_suspended(true)` | Role dicabut | `user_roles` tanpa `seller` | DB | **GAGAL** ❌ |
| TS-07 | Toko `suspended` | INSERT produk sebagai seller | Ditolak | `42501` atau cek status | DB | **GAGAL** ❌ (berhasil 201) |
| TS-08 | Toko `suspended` | `set_seller_suspended(false)` | Role diberikan kembali | `user_roles` punya `seller` | DB | **Belum diuji** |
| TS-09 | Admin non-`sellers.approve` | `review_seller` | `FORBIDDEN` | exception | DB | **Lulus** (kode) |
| TS-10 | User | INSERT `user_roles` untuk diri sendiri | Ditolak trigger | exception | DB | **Lulus** (kode) |
| TS-11 | Seller | PATCH `stores.status='active'` | Diabaikan trigger | status tidak berubah | DB | **Lulus** (kode, migrasi 20261004090000) |
| TS-12 | User dihapus | Cek `user_roles` | Role ikut terhapus | count = 0 | DB | **GAGAL** ❌ |

---

## F. Remediation Roadmap

### P0 — Integritas otorisasi (sebelum marketplace diperluas)

| # | Perbaikan | Temuan | Risiko regresi | Kriteria terima |
|---|---|---|---|---|
| P0-1 | Sinkronkan role saat suspend/aktifkan | SELLER-BL-001 | Sedang: perlu putuskan akses read-only | Seller suspended tidak punya permission `seller.*` |
| P0-2 | Izinkan ajukan ulang dari `rejected` | SELLER-BL-002 | Rendah | TS-04 lulus |
| P0-3 | Tangkap `unique_violation` di `apply_as_seller` | SELLER-BL-003 | Sangat rendah | TS-05 lulus |

### P1 — Konsistensi data

| # | Perbaikan | Temuan |
|---|---|---|
| P1-1 | Tambah FK `user_roles.user_id → auth.users ON DELETE CASCADE` | SELLER-BL-004 |
| P1-2 | Tambah FK `stores.owner_id → auth.users ON DELETE RESTRICT` | SELLER-BL-004 |
| P1-3 | Trigger sinkronisasi status ↔ role | SELLER-BL-006 |
| P1-4 | Perbaiki teks UI seller pending (Opsi A) | SELLER-BL-005 |

### P2 — Kebijakan

| # | Keputusan |
|---|---|
| P2-1 | Opsi A vs B untuk seller pending |
| P2-2 | Aturan pengajuan ulang (batas, jeda, blacklist) |
| P2-3 | Akses seller suspended: read-only atau nol |

---

## G. Batasan Audit

- Uji memakai **akun dan toko sintetis**; semuanya sudah dihapus setelah pengujian.
- Tidak ada perubahan kode, skema, kebijakan, atau data produksi.
- **SELLER-BL-001** diverifikasi dengan uji langsung (suspend → cek role → INSERT produk).
- **Kegagalan parsial** `UPDATE stores` lalu `INSERT user_roles` gagal: tidak dapat dipicu
  tanpa mengubah kode, karena keduanya dalam satu fungsi `plpgsql` (atomik per transaksi).
  Secara desain **aman**, tetapi belum diuji dengan injeksi kegagalan.
- **Concurrent approval** diuji dengan 2 request paralel nyata: **lulus**.
- Data role yatim yang ditemukan adalah sisa uji sebelumnya, bukan indikasi produksi.
