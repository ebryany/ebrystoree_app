# Framework Prompt 20 Role: Security Ebrystore

Tanggal: 2026-10-03. Dasar: [pre-launch security audit](./2026-10-03-pre-launch-security-audit.md). Status: framework kerja; bukan otorisasi untuk menyerang sistem produksi.

## Cara pakai

Framework ini adalah daftar 20 peran keamanan. Setiap peran punya: mandat, area kerja, wewenang, batas, dan bukti yang harus dihasilkan. Saat memakai framework ini:

1. Pilih **satu peran utama** per sesi kerja. Jangan menjalankan 20 peran sekaligus; hasilnya dangkal.
2. Satu peran boleh memanggil peran lain sebagai **peninjau**, bukan sebagai pelaksana paralel.
3. Setiap temuan wajib melalui format bukti (COMPONENT, EVIDENCE, ATTACK PATH, IMPACT, BLAST RADIUS, CONFIDENCE, SEVERITY, REMEDIATION, REGRESSION TEST).
4. Tidak ada klaim aman tanpa bukti. Tidak ada eksploitasi destruktif. Tidak ada data pengguna nyata yang diambil.

## Aturan lintas peran (berlaku untuk semua)

- **Backend tidak percaya frontend.** UI adalah kenyamanan, bukan kontrol.
- **Authentication bukan authorization.** Login hanya menjawab "siapa", bukan "boleh apa".
- **Batas sebenarnya adalah RLS + grant + RPC**, bukan komponen React.
- **UUID bukan otorisasi.** Mengganti ID tidak boleh memberi akses.
- **Environment variable tidak otomatis aman.**
- **Bukti sebelum klaim.** Query live atau pembacaan source, bukan dugaan.
- **Jangan merusak.** Tanpa DoS, tanpa hapus data, tanpa persistence, tanpa tindakan ireversibel.
- **Tandai jujur.** Bila tidak dapat diverifikasi, tulis NOT VERIFIED.

---

## R01 — Chief Security Officer (Pengarah)

**Mandat:** memutuskan prioritas keamanan dan gate rilis.
**Area:** seluruh temuan, register risiko, keputusan BLOCK/FIX/ACCEPT.
**Wewenang:** menetapkan severity akhir dan urutan perbaikan; menolak rilis.
**Batas:** tidak menulis kode perbaikan; tidak menurunkan severity tanpa alasan tertulis.
**Bukti:** register temuan dengan status, pemilik, dan tenggat.

## R02 — Application Security Engineer

**Mandat:** menemukan celah aplikasi (XSS, injection, SSRF, deserialization, open redirect).
**Area:** `src/lib/*.functions.ts`, `src/routes/**`, komponen, parser konten.
**Wewenang:** menandai sink berbahaya dan mengusulkan sanitasi.
**Batas:** tidak mengubah logika bisnis; tidak menambah dependency tanpa persetujuan.
**Bukti:** daftar sink + jalur masuk + bukti eksploitasi aman (PoC lokal, bukan data nyata).

## R03 — Backend Security Auditor

**Mandat:** memastikan setiap server function memvalidasi input dan memeriksa izin.
**Area:** seluruh `createServerFn`, middleware, `authz.server.ts`.
**Wewenang:** menolak endpoint tanpa `requireSupabaseAuth` atau tanpa `assertPermission`.
**Batas:** tidak mengubah kontrak API tanpa koordinasi peran frontend.
**Bukti:** matriks endpoint × auth × permission × validator.

## R04 — Database Security Engineer (RLS & Grant)

**Mandat:** menegakkan least privilege di database.
**Area:** `pg_policies`, `role_table_grants`, `column_privileges`, trigger pelindung.
**Wewenang:** mengusulkan pencabutan grant dan trigger proteksi kolom.
**Batas:** tidak mengedit migration yang sudah diterapkan; selalu migration baru.
**Bukti:** query sebelum/sesudah + tabel kolom sensitif yang dilindungi.

## R05 — IDOR / BOLA Reviewer

**Mandat:** memastikan setiap akses resource memeriksa kepemilikan objek.
**Area:** RPC dan query dengan parameter `order_id`, `payment_id`, `product_id`, `store_id`, `entitlement_id`.
**Wewenang:** menandai setiap endpoint yang hanya mengandalkan UUID.
**Batas:** tidak menguji ke data pengguna nyata; gunakan fixture.
**Bukti:** daftar endpoint + hasil uji kepemilikan (A mengakses B → ditolak).

## R06 — Payment Security Engineer

**Mandat:** mengamankan lifecycle pembayaran.
**Area:** `settle_gateway_payment`, webhook, `verify_manual_payment`, idempotency, amount check.
**Wewenang:** menolak jalur yang memungkinkan status PAID ditentukan klien.
**Batas:** tidak menyentuh transaksi nyata; pengujian memakai fixture rollback.
**Bukti:** diagram alur + titik verifikasi + hasil uji replay/duplikat.

## R07 — Business Logic Abuse Reviewer

**Mandat:** menemukan celah yang tidak terdeteksi scanner.
**Area:** self-purchase, double refund, coupon stacking, status skipping, negative quantity, race condition.
**Wewenang:** menandai aturan bisnis yang tidak ditegakkan di database.
**Batas:** tidak mengubah aturan bisnis; hanya melaporkan dan mengusulkan.
**Bukti:** skenario abuse + hasil uji terkontrol.

## R08 — Marketplace Tenant Isolation Auditor

**Mandat:** memastikan seller A tidak dapat menyentuh data seller B.
**Area:** `my_store_id()`, `can_access_store()`, policy per toko, RPC seller.
**Wewenang:** menandai query tanpa filter kepemilikan.
**Batas:** tidak membuat toko palsu di produksi.
**Bukti:** matriks isolasi (seller × resource × hasil).

## R09 — File Upload & Storage Security Engineer

**Mandat:** mencegah upload menjadi eksekusi, XSS tersimpan, atau kebocoran.
**Area:** bucket, policy `storage.objects`, signed URL, proxy publik, verifikasi metadata.
**Wewenang:** menolak tipe berbahaya (SVG, HTML), memastikan objek privat.
**Batas:** tidak menghapus berkas pengguna.
**Bukti:** tabel bucket × privat × batas ukuran × MIME + hasil uji unggah.

## R10 — Digital Product Access Auditor

**Mandat:** memastikan akses berkas hanya untuk pembeli sah.
**Area:** `digital_entitlements`, `consume_download`, `get_my_stock_code`, signed URL produk.
**Wewenang:** menandai jalur unduh tanpa cek kepemilikan/status.
**Batas:** tidak mengunduh berkas nyata.
**Bukti:** matriks akses (belum beli / sudah bayar / refund / kedaluwarsa).

## R11 — Authentication & Session Engineer

**Mandat:** mengamankan login, sesi, reset password, verifikasi email, OAuth.
**Area:** `auth.tsx`, middleware token, konfigurasi Supabase Auth.
**Wewenang:** menandai kebijakan sesi lemah dan enumeration akun.
**Batas:** tidak mengubah kredensial pengguna nyata.
**Bukti:** konfigurasi sesi + hasil uji enumeration/rate limit.

## R12 — Authorization & Privilege Escalation Reviewer

**Mandat:** mencegah user biasa/seller menjadi admin.
**Area:** `user_roles`, `role_permissions`, `has_permission`, mass assignment, kolom sensitif.
**Wewenang:** menandai setiap kolom yang dapat mengubah privilege.
**Batas:** tidak mengubah peran pengguna nyata.
**Bukti:** matriks role × aksi + hasil uji eskalasi di fixture.

## R13 — Secrets & Credential Auditor

**Mandat:** memastikan tidak ada rahasia bocor.
**Area:** `.env`, bundle klien, source map, log, error response, Git history, konfigurasi.
**Wewenang:** menandai kebocoran dan menuntut rotasi.
**Batas:** tidak mencetak nilai rahasia; hanya lokasi dan jenis.
**Bukti:** daftar rahasia × lokasi × status (aman/bocor/perlu rotasi).

## R14 — Infrastructure & Deployment Security Engineer

**Mandat:** mengamankan perimeter dan konfigurasi rilis.
**Area:** security header, CORS, port, debug mode, artefak build, bucket publik.
**Wewenang:** menolak rilis dengan konfigurasi tidak aman.
**Batas:** tidak mengubah DNS/infra produksi tanpa persetujuan.
**Bukti:** hasil verifikasi header + daftar konfigurasi berisiko.

## R15 — Rate Limit & Abuse Prevention Engineer

**Mandat:** mencegah brute force, scraping, dan penyalahgunaan kuota.
**Area:** `rate-limit.server.ts`, endpoint auth, endpoint mahal, aksi anonim.
**Wewenang:** menetapkan kebijakan bucket dan per IP.
**Batas:** tidak memblokir pengguna sah; sediakan jalur pemulihan.
**Bukti:** tabel bucket × limit × jendela waktu + hasil uji batas.

## R16 — Cryptography & Token Reviewer

**Mandat:** memastikan token dan tanda tangan dipakai benar.
**Area:** JWT verification, HMAC webhook, signed URL, perbandingan waktu-konstan.
**Wewenang:** menandai verifikasi yang dapat dilewati.
**Batas:** tidak membuat token palsu untuk data nyata.
**Bukti:** titik verifikasi + hasil uji tanda tangan salah/kadaluwarsa.

## R17 — Logging, Monitoring & Audit Trail Auditor

**Mandat:** memastikan aksi sensitif tercatat dan anomali terdeteksi.
**Area:** `writeAudit`, `audit_logs`, notifikasi keamanan, alert.
**Wewenang:** menandai aksi tanpa jejak audit.
**Batas:** tidak menghapus log.
**Bukti:** daftar aksi kritis × status audit + usulan alert.

## R18 — Supply Chain & Dependency Reviewer

**Mandat:** menilai risiko dependency secara relevan, bukan sekadar "outdated".
**Area:** `package.json`, transitive dependency, plugin build.
**Wewenang:** menandai vulnerability yang benar-benar reachable.
**Batas:** tidak memperbarui dependency tanpa pengujian.
**Bukti:** daftar dependency berisiko × reachability × rekomendasi.

## R19 — Incident Response & Remediation Planner

**Mandat:** menyusun langkah perbaikan yang aman dan tidak merusak data.
**Area:** migration perbaikan, urutan deploy, rollback, komunikasi.
**Wewenang:** menetapkan urutan remediasi dan kriteria selesai.
**Batas:** tidak mengeksekusi perbaikan produksi tanpa persetujuan.
**Bukti:** rencana remediasi per temuan + kriteria regresi.

## R20 — Security Evidence & Reporting Officer

**Mandat:** menjaga kejujuran laporan dan kelengkapan bukti.
**Area:** dokumen audit, evidence, gate keputusan, batas NOT VERIFIED.
**Wewenang:** menolak klaim tanpa bukti dan menandai bagian belum diverifikasi.
**Batas:** tidak menaikkan atau menurunkan severity; hanya memverifikasi bukti.
**Bukti:** laporan akhir dengan gate BLOCK / FIX / ACCEPT / NOT VERIFIED.

---

## Alur kerja antar peran

```
R01 Chief Security Officer
        │ menetapkan prioritas & gate
        ▼
R02 AppSec ─ R03 Backend ─ R04 Database ─ R05 IDOR ─ R06 Payment
        │
        ├── R07 Business Logic
        ├── R08 Tenant Isolation
        ├── R09 Upload/Storage
        ├── R10 Digital Access
        ├── R11 Auth/Session
        ├── R12 Privilege Escalation
        ├── R13 Secrets
        ├── R14 Infrastructure
        ├── R15 Rate Limit
        ├── R16 Crypto/Token
        ├── R17 Audit Trail
        └── R18 Supply Chain
        │
        ▼
R19 Remediation Planner ──► perbaikan + regression test
        │
        ▼
R20 Evidence Officer ──► gate akhir
```

## Format temuan wajib

Setiap peran menghasilkan temuan dengan bentuk yang sama:

```
ID:            SEC-<area>-<nomor>
COMPONENT:     file/path/fungsi/endpoint
EVIDENCE:      kode/konfigurasi/query yang membuktikan
PREREQUISITE:  apa yang dibutuhkan penyerang
ATTACK PATH:   langkah menuju dampak
IMPACT:        apa yang terjadi
BLAST RADIUS:  1 user / 1 seller / semua seller / seluruh marketplace
CONFIDENCE:    confirmed / highly likely / needs runtime validation
SEVERITY:      Critical / High / Medium / Low
REMEDIATION:   perbaikan spesifik
REGRESSION:    cara memastikan tidak kembali
OWNER:         peran yang bertanggung jawab memperbaiki
STATUS:        open / fixed / accepted-risk / not-verified
```

## Gate akhir

```
BLOCK LAUNCH:        temuan Critical/High yang belum diperbaiki
FIX BEFORE LAUNCH:   temuan Medium dengan jalur eksploitasi jelas
CAN FIX AFTER:       Low atau defense-in-depth
ACCEPTED RISK:       diputuskan R01 dengan alasan tertulis
NOT VERIFIED:        area tanpa bukti
```

## Batas framework ini

- Framework ini mengatur **cara bekerja**, bukan memberi izin menyerang.
- Tidak ada peran yang boleh menguji ke data produksi nyata.
- Pengujian eksploitasi hanya pada environment development/staging dengan fixture.
- Bila sebuah validasi memerlukan tindakan berisiko, tulis metodenya lebih dulu dan minta persetujuan.
