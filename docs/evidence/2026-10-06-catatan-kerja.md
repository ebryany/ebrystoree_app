# Catatan Kerja — 2026-10-06

Ringkasan pekerjaan hari ini, termasuk yang sudah selesai dan yang masih terbuka.

---

## 1. Audit yang dilakukan

| Dokumen | Cakupan |
|---|---|
| `docs/audit/2026-10-06-audit-business-logic.md` | Logika bisnis transaksi: checkout, payment, refund, ledger, fulfillment |
| `docs/audit/2026-10-06-audit-seller-onboarding.md` | Siklus seller: daftar, approve, role, suspend, ajukan ulang |
| `docs/audit/2026-10-06-audit-product-ownership-moderation.md` | Kepemilikan produk, moderasi, snapshot harga |
| `docs/audit/2026-10-06-audit-uiux-frontend-desktop.md` | Konsistensi layout desktop 5 shell |

Metode: inspeksi migrasi + RPC, uji langsung ke DB dengan akun sintetis (lalu dihapus),
pengukuran runtime di browser.

---

## 2. Perbaikan backend (sudah diterapkan)

Empat migrasi:

| File | Menutup temuan |
|---|---|
| `20261006100001_fix_seller_lifecycle.sql` | Suspend tidak cabut role; `rejected` dead-end; race `apply_as_seller`; cek status toko saat submit produk |
| `20261006100002_fix_product_moderation.sql` | Edit produk approved tidak reset moderasi; produk toko suspended tampil publik |
| `20261006100003_fix_payment_integrity.sql` | Topup terima kelebihan; role yatim (FK `auth.users`) |
| `20261006100004_fix_reapply_trigger.sql` | Perbaikan dari perbaikan: trigger proteksi toko memblokir transisi `rejected → pending` |

**Bukti uji (dijalankan ulang setelah migrasi):**

| Skenario | Hasil |
|---|---|
| Toko pending → role seller | tidak ada ✅ |
| Toko approve → role seller | ada ✅ |
| Toko suspend → role seller | dicabut ✅ |
| Seller suspended buat produk | ditolak RLS ✅ |
| `rejected` → ajukan ulang | `status='pending'` ✅ |
| 2× apply paralel | `duplicate:true`, tanpa error mentah ✅ |
| Produk approved ubah harga | kembali `draft` + `pending` ✅ |
| Anon lihat produk toko pending | tidak tampil ✅ |
| Role yatim | bersih ✅ |

Detail: `docs/evidence/2026-10-06-perbaikan-audit-seller-produk.md`

---

## 3. Perbaikan UI

### 3.1 Navbar mobile — `src/components/site-header.tsx`

**Masalah terukur sebelum:**
- Dua ikon search dalam satu form (satu dekoratif, satu tombol)
- Form search menyusut 221px → 147px saat notifikasi muncul
- Chat hilang di bawah 412px

**Perubahan:**
- Mobile: satu tombol "Cari di Ebystore" yang membuka dialog full-screen
- Desktop: form inline tetap seperti sebelumnya
- Dialog: autofocus input, tutup dengan X atau Escape, fokus kembali ke pemicu
- Panel bawah dialog berisi tautan jelajah (Produk, Layanan, Bantuan, Artikel)

**Status:** build lolos. Verifikasi 7 viewport **belum dijalankan ulang** setelah perubahan
terakhir (browser sempat tertutup).

### 3.2 Sidebar seller — `src/routes/_authenticated/seller.tsx`

- `DashboardSidebar` (menu customer) → `SellerSidebar` (menu toko)
- Teks pending: "Anda dapat menyiapkan produk" → "Anda belum bisa menambah produk sampai toko disetujui"

### 3.3 Homepage bawah hero

**Section produk — `src/routes/index.tsx`**

Akar masalah terukur: hanya **2 produk**, masing-masing 344px, viewport carousel **1361px**
→ **673px kosong (49%)**; dua panah tampil tapi **keduanya disabled**.

Perbaikan: grid saat `<= 4` item (tidak ada yang perlu digulir), carousel saat `> 4`.
Ambang 4 = jumlah kolom maksimum desktop.

**Section seller — `src/components/home/home-hero.tsx`**

Klaim copy diperiksa terhadap kode:
- "Dana ditahan sampai pembeli menerima hasil" → **benar** (`credit_seller_earnings`
  hanya berjalan saat order `completed` + receipt `accepted`)
- "lalu masuk ke saldo tokomu" → **berpotensi menyesatkan** karena payout belum ada

Diubah menjadi: "terima pendapatan yang tercatat di saldo toko setelah pembeli menerima hasil"
dan judul kartu "Pembayaran aman" → "Pendapatan tercatat".

**Footer — `src/components/site-footer.tsx`**

Container `max-w-6xl` (1152px) tidak sejajar dengan homepage yang full-width.
Diubah ke full-width dengan padding `lg:px-8`, sama seperti section di atasnya.

---

## 4. Yang belum selesai

| Item | Status | Alasan |
|---|---|---|
| Verifikasi 7 viewport navbar | **Belum** | Browser tertutup saat pengukuran |
| Verifikasi 5 viewport homepage | **Belum** | Sama |
| Screenshot before/after | **Belum** | Sama |
| 11 test `src/components/home/` gagal | **Pre-existing** | Bukan dari perubahan ini; soal copy "Toko resmi"/"Brief pembeli" |
| Refund saldo vs transfer | **Butuh keputusan** | O-10 |
| Payout seller | **Belum dibangun** | O-03/O-04 |
| Dispute | **Belum dibangun** | Prompt 25 |
| Edit produk saat `pending` | **Butuh keputusan** | Blokir atau reset antrean |

---

## 5. Catatan teknis penting

1. **Perbaikan #3 (reapply) sempat gagal.** Trigger `protect_store_privileged_fields`
   mengembalikan `status` ke nilai lama untuk non-admin. Respons bilang `reapplied:true`
   tapi status tetap `rejected`. Diperbaiki lewat migrasi `100004` dengan penanda GUC
   yang tidak bisa dipalsukan dari PostgREST.

2. **Pengukuran carousel sempat salah.** Selector `[role="group"]` menangkap elemen lain,
   sehingga terbaca 3 slide dengan lebar 1841px. Setelah diperbaiki ke
   `[aria-roledescription="slide"]`, hasilnya 2 slide @344px. Angka pertama adalah
   artefak pengukuran, bukan bug layout.

3. **Dev server pindah port.** 8080 dipakai proses lain (`AgentService.exe`), 8082 mati,
   sekarang jalan di **8081**.

4. **`SpotLightItem` membungkus kartu dengan `<div>`.** Perlu `min-w-0` di parent agar
   tidak memaksa lebar; saat ini aman karena `CarouselItem` sudah `min-w-0`.
