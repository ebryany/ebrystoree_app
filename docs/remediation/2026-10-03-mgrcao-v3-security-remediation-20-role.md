# MGRCAO V3: security remediation pre-launch (20 role)

Tanggal: 2026-10-03. Dasar: [pre-launch security audit](../audit/2026-10-03-pre-launch-security-audit.md) dan [framework 20 role](./2026-10-03-framework-prompt-20-role-security.md). Status: framework kerja; belum dieksekusi.

Format MGRCAO V3: **M**ission · **G**oal · **R**ole · **C**onstraints · **A**ctions · **O**utcome. Setiap bagian dipetakan ke peran yang bertanggung jawab agar pekerjaan terarah, bukan sekadar daftar tugas.

---

## M: Mission

Menutup seluruh launch blocker dan temuan High sebelum Ebrystore dipublikasikan, dengan disiplin **bukti sebelum klaim** dan tanpa mengubah aturan bisnis yang sudah benar.

Inti misi: dua temuan High berasal dari satu asumsi kecil yang sama, yaitu bahwa UI adalah satu-satunya jalur tulis. Karena klien dapat memanggil PostgREST langsung dengan JWT-nya sendiri, batas sebenarnya adalah **RLS + column grant + RPC**. Misi ini menegakkan batas itu di tempat yang masih bocor, tanpa merusak alur yang sudah bekerja.

Prinsip yang dipegang:

- Backend tidak percaya frontend; UI adalah kenyamanan, bukan kontrol.
- Authentication bukan authorization.
- UUID bukan otorisasi.
- Bukti sebelum klaim; tandai NOT VERIFIED bila tidak dapat dibuktikan.
- Tidak ada tindakan destruktif, tidak ada data pengguna nyata, tidak ada persistence.

---

## G: Goal

1. **BLOCKER-1 tertutup.** Seller tidak dapat mengubah kolom sensitif pada tokonya (`status`, `is_platform`, `reviewed_by`, `reviewed_at`, `suspended_reason`, `owner_id`, `slug`, `created_at`). Perubahan status toko hanya lewat RPC admin berizin.
2. **BLOCKER-2 tertutup.** Seller tidak dapat memalsukan `sold_count` dan `available_stock`. Kolom itu hanya berubah lewat RPC transaksi.
3. **FINDING-4 tertutup.** `create_digital_order` menolak pembelian dari toko sendiri, konsisten dengan jalur jasa seller.
4. **FINDING-5 tervalidasi.** `submit_payment_proof` terbukti memeriksa kepemilikan pembayaran di seluruh cabang, atau diperbaiki bila tidak.
5. **Refund mencabut akses.** Terverifikasi bahwa refund menetapkan `digital_entitlements.revoked_at`.
6. **FINDING-3 terverifikasi.** Proteksi brute force auth aktif di Supabase, atau ditambahkan pembatasan aplikasi.
7. **Regression test tersedia** untuk setiap perbaikan, sehingga bug tidak dapat kembali tanpa terdeteksi.
8. **Tidak ada regresi** pada alur yang sudah benar: checkout, pembayaran, jasa seller, katalog, dan moderasi tetap bekerja.

---

## R: Role

Framework ini memakai 20 peran dari [framework 20 role](./2026-10-03-framework-prompt-20-role-security.md). Untuk remediasi ini, peran diaktifkan sebagai berikut:

| Peran | Keterlibatan |
| --- | --- |
| **R01 Chief Security Officer** | Menetapkan gate: BLOCK / FIX / ACCEPT; menandatangani selesai |
| **R04 Database Security (RLS & Grant)** | Pemilik utama BLOCKER-1 dan BLOCKER-2: trigger proteksi kolom + pencabutan grant |
| **R07 Business Logic Abuse** | Pemilik FINDING-4 (self-purchase) dan verifikasi refund mencabut akses |
| **R12 Privilege Escalation Reviewer** | Verifikator BLOCKER-1: memastikan jalur eskalasi tertutup dari sisi role |
| **R06 Payment Security Engineer** | Verifikator FINDING-5 dan jalur pembayaran setelah perubahan |
| **R05 IDOR/BOLA Reviewer** | Verifikator kepemilikan pada RPC yang diubah |
| **R15 Rate Limit Engineer** | Pemilik FINDING-3 |
| **R11 Auth & Session Engineer** | Pendamping R15 untuk kebijakan auth |
| **R08 Tenant Isolation Auditor** | Verifikator bahwa isolasi seller tetap utuh setelah pencabutan grant |
| **R19 Remediation Planner** | Menyusun urutan migration dan rollback |
| **R20 Evidence Officer** | Menjaga bukti dan menandai NOT VERIFIED |

**Aturan kerja:** satu peran utama per sesi; peran lain hanya meninjau. Tidak ada peran yang boleh mengeksekusi perbaikan produksi tanpa persetujuan R01.

---

## C: Constraints

- **Jangan mengedit migration yang sudah diterapkan.** Semua perbaikan lewat migration baru.
- **Jangan mengubah aturan bisnis** yang sudah benar; hanya menegakkan batas yang bocor.
- **Pencabutan grant harus menyisakan kolom yang memang hak seller** (`name`, `description`, `logo_url`, `contact_phone`, `contact_email`) agar pengaturan toko tetap bekerja.
- **Trigger proteksi tidak boleh memblokir admin berizin.** Periksa `is_admin(auth.uid())` sebelum menegakkan aturan.
- **Jangan memakai `RAISE EXCEPTION` pada trigger yang menyentuh alur normal** tanpa memastikan alur itu tidak mengirim kolom terlarang. Bila ragu, abaikan perubahan kolom (set ke nilai lama) alih-alih menggagalkan transaksi.
- **Semua pengujian memakai fixture rollback**, bukan transaksi nyata.
- **Tanpa dependency baru.** Tanpa perubahan pada jalur uang selain guard yang diminta.
- **Setiap klaim disertai bukti** query live atau hasil uji; yang belum dapat diverifikasi ditulis NOT VERIFIED.
- Bahasa Indonesia, tanpa em dash.

---

## A: Actions

### Fase 1 — Tutup BLOCKER-1 (R04, diverifikasi R12)

1. Migration: buat trigger `BEFORE UPDATE` pada `public.stores` yang mengembalikan kolom sensitif ke nilai lama bila pemanggil bukan admin:
   `status`, `is_platform`, `reviewed_by`, `reviewed_at`, `suspended_reason`, `owner_id`, `slug`, `created_at`.
2. Migration: cabut grant UPDATE kolom sensitif dari `authenticated`; sisakan kolom profil.
3. Verifikasi: seller PATCH `status` → tidak berubah; seller PATCH `name` → berhasil; admin berizin ubah `status` → berhasil dan tercatat audit.
4. Regression test: fixture seller suspended mencoba mengaktifkan diri → tetap `suspended`.

### Fase 2 — Tutup BLOCKER-2 (R04, diverifikasi R07)

5. Migration: perluas `protect_moderation_fields` untuk melindungi `sold_count` dan `available_stock` dari non-admin.
6. Migration: cabut grant UPDATE kolom `sold_count` dari `authenticated`.
7. Verifikasi: seller PATCH `sold_count` → tidak berubah; RPC transaksi tetap menaikkannya; seller PATCH `price` → berhasil dan tercatat audit.

### Fase 3 — Tutup FINDING-4 (R07)

8. Migration: tambahkan guard `SELF_PURCHASE_DENIED` pada `create_digital_order`, konsisten dengan `create_marketplace_service_order`.
9. Verifikasi: seller memesan produknya sendiri → ditolak; pembeli lain → berhasil.
10. Regression test: fixture toko + produk, dua aktor (pemilik dan pembeli lain).

### Fase 4 — Validasi FINDING-5 dan refund (R06, R05)

11. Audit ulang seluruh cabang `submit_payment_proof`; pastikan setiap jalur memeriksa `payments.user_id = auth.uid()`.
12. Uji dengan fixture: User A memanggil RPC dengan payment milik User B → harus `NOT_FOUND`.
13. Verifikasi bahwa jalur refund menetapkan `digital_entitlements.revoked_at`; bila tidak, tambahkan pada RPC refund dan uji ulang.

### Fase 5 — Rate limit auth (R15, R11)

14. Verifikasi konfigurasi brute force Supabase; catat sebagai bukti atau NOT VERIFIED.
15. Bila tidak tersedia, tambahkan pembatasan aplikasi untuk reset password dan percobaan login.

### Fase 6 — Bukti dan gate (R19, R20)

16. Susun urutan deploy dan rollback untuk seluruh migration.
17. Jalankan unit test, build, lint, dan fixture rollback.
18. Tulis evidence dengan status per temuan: fixed / accepted / not-verified.
19. R01 menetapkan gate akhir.

---

## O: Outcome

Gate akhir yang harus tercapai sebelum menyatakan remediation selesai:

```
BLOCK LAUNCH (harus kosong):
  - BLOCKER-1: tertutup, dengan bukti seller tidak dapat mengubah status toko
  - BLOCKER-2: tertutup, dengan bukti sold_count/available_stock tidak dapat dipalsukan

FIX BEFORE LAUNCH:
  - FINDING-4: self-purchase digital ditolak
  - FINDING-5: kepemilikan payment proof terverifikasi
  - Refund mencabut akses produk (terverifikasi atau diperbaiki)
  - FINDING-3: proteksi auth terverifikasi atau ditambahkan

REGRESSION:
  - Setiap perbaikan punya test yang gagal bila perbaikan dibalik
  - Alur checkout, pembayaran, jasa seller, katalog, moderasi tetap lulus

EVIDENCE:
  - Setiap temuan punya COMPONENT, EVIDENCE, ATTACK PATH, IMPACT, BLAST RADIUS,
    CONFIDENCE, SEVERITY, REMEDIATION, REGRESSION, OWNER, STATUS
  - Bagian yang belum dapat diverifikasi ditandai NOT VERIFIED, bukan diklaim aman

ACCEPTED RISK (hanya oleh R01, dengan alasan tertulis):
  - Guard tambahan pada claim_stock_code (tidak terekspos saat ini)
  - Audit log perubahan harga seller
```

**Definisi selesai:** seluruh BLOCK LAUNCH kosong, FIX BEFORE LAUNCH terverifikasi dengan bukti, regression test tersedia, dan tidak ada regresi pada alur yang sudah benar. Selama masih ada temuan tanpa bukti, statusnya NOT VERIFIED, bukan aman.
