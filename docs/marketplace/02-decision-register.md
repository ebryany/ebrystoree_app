# 02 — Decision Register & Risk Register (Marketplace)

Prompt 01 deliverable · Tanggal: 2026-09-30

---

## A. Decision Register

Keputusan yang **sudah final** (dari Owner / paket MGRCAO V3), dan yang **menunggu Owner**.

### A.1 — Keputusan final (sudah ditetapkan)

| ID | Keputusan | Nilai | Sumber |
|---|---|---|---|
| M-01 | Model marketplace | Multi-vendor, **evolusi** dari single-vendor | Owner |
| M-02 | Checkout | **Satu seller per order** (direct checkout) untuk MVP | Paket MGRCAO (default) |
| M-03 | Produk legacy | Dimiliki **"platform store"** setelah backfill | Paket MGRCAO (default) |
| M-04 | Kategori | Taxonomy **platform-controlled** untuk MVP | Paket MGRCAO (default) |
| M-05 | Toko per seller | **Satu toko per akun** untuk MVP (model jangan buntu) | Paket MGRCAO (default) |
| M-06 | Penerima pembayaran | **Platform** menerima; seller via ledger internal + payout | Paket MGRCAO (default) |
| M-07 | Istilah "escrow" | **Dilarang** dipakai tanpa dasar legal/provider | AGENTS.md |
| M-08 | Uang | **Server-authoritative**, ledger append-only | AGENTS.md |
| M-09 | Isolasi seller | **RLS + server authz**, bukan UI | AGENTS.md |
| M-10 | Arah visual | Identitas **Ebrystore**, bukan meniru Shopee/Tokopedia | Owner (dikonfirmasi) |
| M-11 | Services/akademik legacy | Dipisah, bukan template seller | Paket MGRCAO (default) |

### A.2 — Menunggu Keputusan Owner (`OWNER_DECISION_REQUIRED`)

| ID | Pertanyaan | Dampak | Default aman bila tidak diputuskan |
|---|---|---|---|
| ✅ O-01 | **Persentase platform fee** | Menentukan pendapatan platform & hak seller | Tunda; ledger tetap catat, fee = 0 sampai diputuskan |
| ✅ O-02 | **Aturan refundability fee** | Saat refund, fee dikembalikan atau tidak? | Tunda payout; catat sebagai keputusan |
| ✅ O-03 | **Batas & jadwal payout** | Kapan seller bisa cairkan dana? | Payout manual + manual approval sampai diputuskan |
| ✅ O-04 | **Kebijakan hold/settlement** (berapa hari dana ditahan) | Melindungi dari refund/dispute | Default konservatif: hold sampai order `completed` |
| ✅ O-05 | **Regulasi uang elektronik (BI/OJK)** | Apakah saldo/credit legal disimpan? | **JANGAN produksi** fitur saldo/payout sebelum konsultasi |
| ✅ O-06 | **Kriteria verifikasi seller** (dokumen apa) | Siapa boleh jualan | Verifikasi manual admin sampai diputuskan |
| ✅ O-07 | **Kebijakan moderasi produk** (auto vs manual) | Kecepatan publish vs risiko | Manual admin untuk MVP |
| ✅ O-08 | **Model komisi operator** (bila ada) | Hubungan role operator dengan seller | Tidak berubah (tracking saja) |
| ✅ O-09 | **Apakah jasa/akademik juga bisa di-seller-kan** | Scope marketplace | Non-scope MVP (produk digital dulu) |
| ✅ O-10 | **Sumber dana saat refund seller-generated** | Uang seller vs platform | Tunda; allocation menyusul |
| ✅ O-11 | **Multi-currency** | Scope | Non-goal (IDR saja) |
| ✅ O-12 | **Email provider transaksional** | Notifikasi marketplace | Tunda; in-app dulu |

> Tanda ✅ = terdaftar; **belum diputuskan**.

### A.3 — Keputusan Dashboard Pertumbuhan (marketing/konten/SEO)

| ID | Keputusan | Nilai | Sumber |
|---|---|---|---|
| O-20 | Bentuk dashboard | **SATU dashboard, tiga bagian** (Marketing, Konten, SEO) + Ringkasan & Kampanye | Owner (2026-10-05) |
| O-21 | Akses | **Permission saja** (`marketing.view`, `content.manage`, `seo.view`), tanpa peran baru untuk MVP | Usulan riset (menunggu konfirmasi) |
| O-22 | Sumber tracking | **Tracking sendiri** di database untuk event; tanpa pihak ketiga | Usulan riset (menunggu konfirmasi) |
| O-23 | Retensi data event mentah | Usulan: 90 hari mentah, agregat disimpan permanen | Usulan riset (menunggu konfirmasi) |

**Konsekuensi O-20:** navigasi memakai satu grup "Pertumbuhan" berisi 5 menu
(Ringkasan, Marketing, Konten, SEO, Kampanye). Gaya visual mengikuti dashboard admin
existing tanpa identitas baru.

### A.4 — Keputusan UI/UX Home (desktop & mobile, arah iOS)

| ID | Keputusan | Nilai | Sumber |
|---|---|---|---|
| U-01 | Bahasa desain | **Condong iOS di mobile**, tetap Ebrystore di desktop | Owner (2026-10-05) |
| U-02 | Bottom navigation di home | **TIDAK dipakai.** Komponen `bottom-nav.tsx` tidak diubah | Owner (2026-10-05) |
| U-03 | Lebar wadah desktop | **1280px** untuk katalog; teks tetap 1152px | Usulan riset, dieksekusi |
| U-04 | Radius tombol | **8px** (siku, mengikuti pola Apple), bukan pill | Usulan riset, dieksekusi |
| U-05 | Ukuran body | **16px** di home desktop | Usulan riset, dieksekusi |
| U-06 | Tinggi header mobile | **<= 88px** (dari 135px) | Usulan riset, dieksekusi |
| U-07 | Safe area iOS | **Dikerjakan sekarang.** Ini bug, bukan preferensi | Usulan riset, dieksekusi |

**Konsekuensi U-02:** halaman home tidak memakai bar bawah. Komponen
`src/components/ebry/bottom-nav.tsx` tetap dipakai layout privat
(dashboard/operator/seller) dan **tidak disentuh** oleh pekerjaan home.

**Konsekuensi U-07:** `viewport-fit=cover` ditambahkan di `__root.tsx` (berdampak ke
semua halaman, wajib regression guard) dan header publik memakai
`env(safe-area-inset-top)`.

---

## B. Risk Register

| # | Risiko | Probabilitas | Dampak | Mitigasi | Status |
|---|---|---|---|---|---|
| R-01 | Saldo seller tidak cocok dengan uang nyata | Sedang | Tinggi | Ledger append-only; saldo dihitung; reconciliation | OPEN |
| R-02 | Kebocoran data antar-seller (IDOR) | Sedang | Tinggi | RLS + object authz + **test IDOR wajib** | OPEN |
| R-03 | Entitlement pembeli lama rusak saat migrasi ownership | Rendah | Tinggi | Migrasi aditif; entitlement lama tidak disentuh | OPEN |
| R-04 | Seller publish produk berbahaya/larang | Sedang | Sedang | Boundary moderasi; risk flags | OPEN |
| R-05 | Payout dibayar sebelum refund/dispute selesai | Sedang | Tinggi | Urutan wajib: ledger → allocation → dispute → payout | OPEN |
| R-06 | Total/fee diubah di frontend | Rendah | Tinggi | Server-authoritative; test negatif | OPEN |
| R-07 | Klaim "escrow/KYC" padahal tidak ada | Sedang | Tinggi | Dilarang; tandai OWNER_DECISION_REQUIRED | MITIGATED (aturan) |
| R-08 | Migrasi destruktif merusak data produksi | Rendah | Kritis | Aditif; backup; uji di lokal dulu | OPEN |
| R-09 | UI dibangun sebelum state machine beres | Sedang | Sedang | UI mengikuti kontrak server; urutan slice | OPEN |
| R-10 | Regresi pada fitur yang sudah jalan | Sedang | Sedang | Pipeline test tiap slice (sudah ada) | MITIGATED |
| R-11 | Vendor lock-in Supabase/Lovable | Sedang | Sedang | Domain logic terisolasi; migrasi terbukti | MITIGATED |
| R-12 | Regulasi uang elektronik (BI/OJK) | Sedang | Tinggi | Konsultasi legal sebelum produksi | OPEN |
| R-13 | Beban server naik saat banyak seller | Sedang | Sedang | Index, pagination, monitoring; Supabase Pro | OPEN |
| R-14 | Kebingungan terminologi (refund/saldo/earning) | Sedang | Rendah | Glosarium + dokumen; label konsisten | MITIGATED |
| R-15 | Force-push/rebase merusak histori Lovable | Rendah | Tinggi | Dilarang keras di AGENTS.md | MITIGATED (aturan) |

---

## C. Prasyarat Sebelum Slice Seller Dimulai

| # | Prasyarat | Status |
|---|---|---|
| 1 | Refund berfungsi | ✅ VERIFIED (lokal) |
| 2 | Scheduler aktif | ✅ VERIFIED (lokal) |
| 3 | Rate limiting ada | ✅ VERIFIED (lokal) |
| 4 | Test & pipeline | ✅ VERIFIED (lokal) |
| 5 | Backup & restore teruji | ⬜ **BELUM** — disarankan sebelum migrasi produksi |
| 6 | Keputusan O-01..O-04 (fee, refund fee, payout, hold) | ⬜ BELUM — dibutuhkan **sebelum Fase Finance** |
| 7 | Keputusan O-05 (legal uang elektronik) | ⬜ BELUM — dibutuhkan **sebelum produksi** |

**Catatan:** keputusan O-01..O-04 **tidak menghambat** slice Seller Domain & Catalog (Prompt 06–16). Dibutuhkan mulai **Fase Finance (20+)**.
