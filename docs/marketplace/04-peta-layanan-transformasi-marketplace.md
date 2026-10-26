# 04 — Peta Layanan Toko → Transformasi Marketplace (MGRCAO V3)

Tanggal: 2026-10-02 · Sifat: **IDENTIFIKASI, BUKAN EKSEKUSI**
Pertanyaan: layanan toko online digital yang sekarang ada, mana yang perlu diperbaiki
agar transformasi ke marketplace lancar dan logika bisnisnya konsisten?

Status markers: `VERIFIED` (ada bukti kode/migrasi) · `PARTIALLY_VERIFIED` ·
`NOT_IMPLEMENTED` · `OWNER_DECISION_REQUIRED`.

---

## M — Mindset

Layanan tidak dinilai dari "apakah fiturnya ada", tapi dari "apakah logika bisnisnya
masih benar ketika ada BANYAK seller". Toko single-vendor bisa benar dengan fee = 0
dan tanpa payout; marketplace tidak. Setiap layanan diuji terhadap 3 pertanyaan:

1. Apakah uang mengalir ke tempat yang benar (platform vs seller)?
2. Apakah seller A tidak bisa melihat/mengubah milik seller B?
3. Apakah pembeli lama tidak rusak (entitlement, order historis)?

## G — Goal

Satu peta: layanan → kondisi nyata hari ini (dengan bukti) → yang jebol di skala
marketplace → prioritas perbaikan. Semua klaim berbasis kode, bukan asumsi.

## C — Bukti Kunci yang Dipakai

- Audit keamanan: `docs/security/00-security-audit-mgrcao-v3.md` (H-1..H-4 fixed, M/L open)
- Audit escrow: `docs/marketplace/03-escrow-audit-dan-rancangan.md` (F-01..F-06 fixed)
- Decision register: `docs/marketplace/02-decision-register.md` (O-01..O-12)
- Verifikasi langsung 2026-10-02: `payout/withdraw` HANYA ada sebagai nilai enum
  `source_type` di `seller_ledger` (`20260930100015_...sql:24`) — tidak ada RPC, server
  function, maupun UI payout. `platform_fee` kolom ledger selalu ditulis `0`; tidak ada
  setting persen fee di mana pun. `search_products_fts` ada di migrasi
  (`20260930100026`) tapi tidak dikenal generated types (tsc error).
- `tsc --noEmit`: 68 error; akar mayoritas = generated types Supabase **basi** (tidak
  mengenal `store_id` di `digital_products` maupun relasi `stores`): produk.$slug (33),
  checkout.produk.$slug (12), inquiries.functions (7), seller.functions (6), po-thread (6).

---

## Peta Layanan & Status

### 1. Akun, Peran & Onboarding Seller — `VERIFIED`, celah kecil

- Ada: enum role + seller, `stores` satu-per-owner, `apply_as_seller` (rate-limited),
  approval admin baru memberi role seller, suspensi toko diblokir di checkout
  (`20260930100028_...sql:31-34`).
- Perlu diperbaiki: (a) kriteria verifikasi seller masih manual tanpa dokumen
  — `O-06 OWNER_DECISION_REQUIRED`; (b) MFA/reauth admin belum terverifikasi (audit).
- Logika bisnis tetap: isolasi seller sudah dijaga RLS (`stores_owner_unique`,
  `my_store_id()`); tidak ada temuan bypass aktif setelah adjudikasi audit.

### 2. Katalog & Moderasi — `VERIFIED`, sudah siap marketplace

- Ada: `store_id` + `moderation_status` + trigger paksa moderasi + `review_product`
  (admin) + reset moderasi saat file berubah (`20260930100024`).
- Baru diperbaiki: H-2 (self-approve via API langsung) — `20261002100001`.
- Perlu diperbaiki: tidak ada yang blokir. Catatan: grant tabel-wide
  `digital_products` ke authenticated tetap lebar; pertimbangkan penyempitan saat ada
  waktu (hardening, bukan blokir).

### 3. Pencarian Lintas Seller — `PARTIALLY_VERIFIED`, ⚠️ RUSAK DI LEVEL TIPE

- Ada: migrasi FTS + GIN + `search_products_fts` (`20260930100026`).
- Jebol: `catalog.functions.ts` memanggil `search_products_fts` tapi generated types
  tidak mengenalnya → tsc error. Artinya typegen tidak pernah di-regenerate setelah
  migrasi marketplace. **Satu akar masalah dengan poin 12.**

### 4. Checkout & Order — `VERIFIED`, 3 celah logika bisnis

- Ada: harga server-authoritative dari DB, snapshot toko + nama produk di
  `order_items`, satu seller per order, cek suspensi + stok, idempotency per payment.
- Perlu diperbaiki (blokir transformasi):
  - **Fee platform tidak ada** — `v_fee := setting_int('admin_fee', 0)` (fee legacy
    admin, bukan fee marketplace); metadata `order_items` TIDAK menyimpan konfigurasi
    fee saat transaksi. Invariant paket ("order item snapshot: fee config") tidak
    terpenuhi. → engine fee + snapshot fee. Owner draft: 3%.
  - **Stok tanpa reservasi** (M-10) — dua checkout konkuren bisa oversell
    unique/code. Di marketplace, kepercayaan seller ke platform hancur kalau stoknya
    terjual dobel.
  - Operator fee di UI checkout belum menampilkan pemecahan harga+fee (muncul setelah
    fee aktif).

### 5. Pembayaran (Manual Transfer + QRIS Sumopod) — `VERIFIED`, 2 risiko uang

- Ada: verifikasi manual berjenjang, `settle_gateway_payment` idempoten + lock +
  amount floor, webhook dengan token/HMAC.
- Perlu diperbaiki (sebelum volume naik):
  - **M-1**: polling QRIS meng-settle dengan `expected_amount` dari DB sendiri,
    amount dari provider dibuang (`payments.functions.ts:126`) — sumber rekonsiliasi
    salah.
  - **M-6**: webhook HMAC tidak cek umur timestamp → replay window tak terbatas.
  - Keputusan gateway jangka panjang (Midtrans vs Sumopod) — `OWNER_DECISION_REQUIRED`,
    sudah dibahas: QRIS-first, Midtrans untuk marketplace resmi.

### 6. Ledger Seller & (Bukan-)Payout — `NOT_IMPLEMENTED` untuk payout

- Ada: ledger append-ish + idempotency unik + kredit saat paid/completed (F-01/F-02
  fixed), saldo dihitung dari SUM, `get_store_balance` ber-guard.
- **Payout TIDAK ADA**: hanya enum `source_type='payout'`. Tidak ada saldo
  available-vs-hold, tidak ada request→approval payout, tidak ada UI seller/admin.
- Perlu diperbaiki (urutan wajib, tidak bisa dilompati):
  1. **O-05 (legal BI/OJK) — OWNER_DECISION_REQUIRED, prasyarat produksi.** Model
     held-funds + payout = berpotensi masuk pengaturan penyelenggara. JANGAN
     produksi sebelum konsultasi.
  2. **Split hold/available** di ledger (O-04; draft Owner: hold 3 hari) — kredit
     jadi dua saldo; refund/dispute memotong hold dulu.
  3. **Workflow payout**: request seller → verifikasi admin → eksekusi + entri
     ledger `payout` + fee penarikan Rp10.000 (draft Owner) + batas/jadwal (O-03).
  4. **Engine fee** saat kredit (draft Owner: 3%): `platform_fee` diisi nyata,
     tampil di invoice/seller dashboard, dan kebijakan refund fee (O-02).

### 7. Refund — `PARTIALLY_VERIFIED`, 1 bug hitung + 1 keputusan

- Ada: request→review→process idempoten, buyer dapat saldo kredit, seller didebit
  per-toko (F-03), reject reset status payment (F-06).
- Perlu diperbaiki: **debit seller parsial salah** — refund parsial mendebit seller
  full subtotal item dan bisa berulang antar-refund (M-2 / BIT-04/05 di audit escrow).
  Wajib beres SEBELUM fee 3% aktif, karena fee membuat hitungannya makin rumit.
- `O-10` (sumber dana refund) & `O-02` (fee ikut refund?) — OWNER_DECISION_REQUIRED.

### 8. Saldo Kredit Pembeli — `VERIFIED`, aman untuk sekarang

- Ada: ledger kredit + idempotency, race overdraw sudah difix (H-3), reversal
  cancel/expire tunggal (H-4).
- Catatan: simpanan saldo pembeli menyentuh `O-05` yang sama; batasi sumber saldo
  hanya dari refund (sudah begitu) sampai legal check selesai.

### 9. Pengiriman Digital & Entitlement — `VERIFIED`, celah sedang

- Ada: mode shared/unique/code, `consume_download` + signed URL 300 detik,
  entitlement per order_item, versioning file.
- Perlu diperbaiki: (a) **M-11** — metadata file (MIME/size) dari klien dipercaya
  saat registrasi; (b) **INFO-01** — akses download saat refund pending (keputusan
  kecil); (c) URL hasil jasa 365 hari (M-8) beda standar dengan produk (300 detik).

### 10. Chat Pembeli–Penjual — `PARTIALLY_VERIFIED`

- Ada: `store_id` di inquiry + role `seller` + RPC seller-scoped (`20260930100027`).
- Perlu diperbaiki: **M-9** — `sender_role`/`is_system` bisa dipalsukan via API
  langsung (policy INSERT tidak membatasi kolom); tsc error relasi `stores`.

### 11. Ulasan & Reputasi — `VERIFIED` dasarnya, `NOT_IMPLEMENTED` lanjutannya

- Ada: review terverifikasi pembelian, rating agregat per toko ber-guard.
- Perlu diperbaiki (bukan blokir): reputasi seller lintas-waktu (peringkat,
  badge, riwayat pelanggaran) — masuk prompt paket tapi belum dibangun.

### 12. Infrastruktur Tipe (root cause tersembunyi) — ⚠️ WAJIB DULUAN

- `tsc --noEmit` = 68 error; mayoritas BUKAN bug logika, tapi generated types
  Supabase basi terhadap migrasi marketplace (tidak kenal `store_id`, `stores`,
  `search_products_fts`). Halaman produk, checkout, chat seller, dan pencarian
  diketik salah di level kompilasi.
- Perbaikan: regenerasi types (satu perintah, aditif, tidak menyentuh data) lalu
  re-audit sisa error yang benar-benar logika.

### 13. Admin & Laporan — `VERIFIED`, sudah mendukung marketplace

- Ada: moderasi queue, keputusan seller, suspend, ledger viewer, marketplace
  overview, laporan transaksi (baru di-redesign), laporan seller
  (`marketplace-report` dengan schema validasi).
- Perlu diperbaiki saat payout ada: antrian approval payout + rekonsiliasi
  (ledger vs payment aktual) — belum ada, masuk P2.

### 14. Notifikasi & Job — `VERIFIED`, celah kecil

- Ada: in-app notification menyeluruh; scheduler expire/overdue/SLA; rate limit DB.
- Perlu diperbaiki: email transaksional (O-12) — OWNER_DECISION_REQUIRED; rate
  limiter fail-open (M-5) untuk flow uang.

---

## Roadmap Prioritas (urutan supaya "lancar")

| Prioritas | Item | Kenapa urutan ini |
|---|---|---|
| **P0-A** | Regen generated types + bersihkan sisa error logika | Semua UI seller-aware sekarang diketik salah; murah, membuka visibilitas sisanya |
| **P0-B** | M-1 (amount provider) + M-6 (webhook freshness) + M-10 (reservasi stok) | Risiko uang & oversell sebelum volume naik |
| **P0-C** | Engine fee 3% (draft) + snapshot fee di `order_items` + tampil di UI checkout/seller | Fondasi pendapatan; wajib ada SEBELUM payout |
| **P1-A** | Fix debit refund parsial (M-2) + keputusan O-02/O-10 | Konsistensi uang sebelum hold/payout |
| **P1-B** | Split hold/available (O-04: 3 hari draft) | Prasyarat payout |
| **P1-C** | **Konsultasi legal O-05 (BI/OJK)** | Blokir produksi payout & saldo |
| **P1-D** | Workflow payout + fee penarikan Rp10.000 (draft) + antrian approval admin | Nilai jual utama bagi seller Telegram ("dana aman") |
| **P2** | Ledger append-only DB-enforced (M-3), audit log (M-4), rekonsiliasi, email notif (O-12), reputasi seller, M-5 fail-closed | Hardening saat volume tumbuh |
| **P3** | Evaluasi Midtrans (sekali QRIS stabil), takedown policy produk AI premium, ToS seller | Skala & legal konten |

Yang SUDAH siap dan tidak perlu diubah untuk marketplace: isolasi seller (RLS),
moderasi, snapshot toko di order, entitlement/download, review terverifikasi,
scheduler, laporan, dashboard seller inti.

## Batasan

Dokumen ini identifikasi berbasis kode + migrasi; skema ter-deploy dan runtime tidak
diuji ulang. Angka fee/hold/withdrawal adalah **draft Owner dari diskusi sebelumnya**,
bukan keputusan final — finalisasi ditandai OWNER_DECISION_REQUIRED di tiap item.
