# Catatan perbaikan: 3-4 Oktober 2026

Ringkasan seluruh perbaikan yang dikerjakan dalam sesi ini, diurutkan berdasarkan waktu. Semua migration terverifikasi diterapkan di database terhubung (25 versi sejak 20261003090000 sampai 20261004095000).

---

## 1. Checkout jasa seller diaktifkan

**Masalah:** kartu jasa di katalog tidak bisa diklik menuju checkout. `MARKETPLACE_SERVICE_CHECKOUT_ENABLED` masih false dan RPC creation masih hard-stop.

**Perbaikan:**
- Route `/checkout/jasa/$id` dengan quote authenticated dari database.
- Form kebutuhan pembeli + persetujuan agreement + ringkasan biaya.
- RPC `create_marketplace_service_order` atomik: snapshot harga/kontrak, idempotency key global, penolakan stale quote/self-purchase/toko nonaktif.
- Detail pesanan pembeli terhubung ke pembayaran existing dan lifecycle jasa.

**Migration:** 20261003140000.

## 2. Realtime jasa seller menyala

**Masalah:** subscription realtime sudah dipasang tapi tidak pernah menerima event. Akar masalah: tabel jasa tidak terdaftar di publication `supabase_realtime`.

**Perbaikan:**
- Tiga tabel jasa ditambahkan ke publication.
- RPC seller memakai `name_snapshot` (nama pesanan tidak berubah saat listing diganti nama).

**Migration:** 20261003150000.

## 3. Upload berkas hasil jasa

**Keputusan owner:** JDO-07 disetujui, upload diaktifkan.

**Perbaikan:**
- Bucket privat `service-deliveries`, 3 policy storage berbasis keanggotaan pesanan.
- Kolom artifact: `storage_path`, `original_name`, `mime_type`, `file_size`.
- RPC delivery menerima berkas dengan verifikasi objek benar-benar ada.
- Unduhan lewat signed URL berumur pendek.

**Migration:** 20261003160000, 20261003170000.

## 4. Timeline jasa dan halaman toko publik

**Perbaikan:**
- Timeline horizontal kiri-ke-kanan, lebar penuh, di posisi paling atas halaman pesanan.
- Muncul hanya setelah bukti transfer diunggah.
- Halaman toko: `PageShell`, avatar inisial, rating, kontak, daftar jasa seller, pencarian dan urutan.
- Rating publik dibuka untuk anon (agregat saja).

**Migration:** 20261003180000.

## 5. Bug rating tidak masuk ke toko (diperbaiki)

**Masalah:** ulasan tersimpan tapi `store_id` kosong, sehingga seller tidak melihat ulasannya dan rating toko selalu 0.

**Perbaikan:**
- Backfill ulasan lama dari produknya.
- Trigger `set_review_store_id` memastikan semua jalur tulis mengisi toko.

**Migration:** 20261003190000.

## 6. "Jasa Saya" + media jasa + wizard

**Perbaikan:**
- "Draft Jasa" diganti "Jasa Saya", tombol "Tambahkan Jasa".
- Media jasa: maksimal 5 gambar/video, bucket privat, proxy publik terkontrol.
- Form dipecah menjadi wizard 4 langkah: Informasi → Kesepakatan → Media → Tinjau, dengan validasi per langkah.

**Migration:** 20261003200000.

## 7. Security hardening menyeluruh

**Temuan:** 45 tabel punya grant tulis untuk `anon`, 9 fungsi bisa dipanggil anon, 5 fungsi SECURITY DEFINER tanpa `search_path`.

**Perbaikan:**
- Grant tulis `anon` dicabut dari seluruh tabel; hanya 3 fungsi publik tersisa.
- `search_path` eksplisit pada semua fungsi definer.
- HSTS + `X-Content-Type-Options` ditambahkan.
- Batas body 64 KB pada webhook.
- Halaman `/admin/settings/security` untuk super_admin.

**Migration:** 20261003210000, 20261003220000, 20261003230000.

## 8. Upload, XSS, dan integritas data

**Temuan:** `product-files` tanpa batas ukuran dan MIME; metadata berkas dipercaya dari klien.

**Perbaikan:**
- Batas MIME + ukuran untuk seluruh 8 bucket; SVG dan HTML dilarang.
- Ukuran dan tipe berkas dibaca dari objek storage, bukan klaim klien.

**Migration:** 20261003240000.

## 9. Pengaturan website konteks marketplace

**Temuan:** kode memakai 10 permission pengaturan, database hanya punya 3. Hanya super_admin yang efektif bisa menyimpan.

**Perbaikan:**
- 13 permission pengaturan terdaftar; admin dapat konten, super_admin dapat semuanya.
- Bagian Marketplace baru: 22 field dalam 6 kelompok (media, aturan jasa, escrow, moderasi, kebijakan seller, refund).
- Batas media/durasi jasa dibaca dari setting dengan fallback default.

**Migration:** 20261003250000, 20261003260000.

## 10. Redesain UX pengaturan website

**Perbaikan:**
- Bilah simpan mengambang, preview sticky di kolom kanan, dialog dampak overlay, pencarian dropdown.
- Sidebar berkelompok (Konten / Transaksi / Sistem) dengan penanda risiko.
- Pengaman `beforeunload` dan pintasan `Ctrl/Cmd+S`.
- `window.confirm` diganti dialog beranimasi.

## 11. Feedback aksi pop up

**Perbaikan:**
- Komponen `ActionResultDialog`: loading / success / error / partial dengan ikon beranimasi.
- Simpan dan reset pengaturan memakai dialog hasil; gagal tidak menutup dialog dan menyediakan "Coba lagi".
- Aksi lanjutan "Lihat audit" setelah sukses.

## 12. Redesain admin orders (sebagian)

**Perbaikan:**
- `getOrderDetail` diperluas: kontrak jasa seller, delivery, event, toko.
- Daftar order: ringkasan kerja 4 angka, filter Jasa seller, filter lanjutan dilipat, kartu baris dengan langkah berikutnya.
- Detail order: banner tindakan + kartu kontrak jasa seller.

## 13. Audit keamanan pre-launch

**Hasil:** 2 launch blocker, 3 temuan Medium, beberapa area NOT VERIFIED.

**Blocker:**
- Seller dapat mengaktifkan kembali tokonya yang di-suspend (policy hanya cek owner, tanpa batas kolom).
- Seller dapat memalsukan `sold_count` dan `available_stock`.

**Dokumen:** `docs/audit/2026-10-03-pre-launch-security-audit.md`.

## 14. Framework 20 role security

**Isi:** 20 peran keamanan (R01 CSO sampai R20 Evidence Officer) dengan mandat, area, wewenang, batas, format temuan wajib, dan gate keputusan.

**Dokumen:** `docs/remediation/2026-10-03-framework-prompt-20-role-security.md`.

## 15. MGRCAO V3 security remediation

**Isi:** M-G-R-C-A-O untuk menutup blocker, memetakan peran ke pekerjaan, 6 fase, gate akhir.

**Dokumen:** `docs/remediation/2026-10-03-mgrcao-v3-security-remediation-20-role.md`.

## 16. Remediasi blocker (dikerjakan 4 Oktober)

**BLOCKER-1 tertutup:**
- Trigger `stores_protect_privileged` mengembalikan kolom kewenangan ke nilai lama untuk non-admin.
- Admin tetap bekerja lewat RPC resmi `set_seller_suspended`.

**BLOCKER-2 tertutup:**
- Grant kolom `sold_count`, `available_stock`, `moderation_status` dicabut dari `authenticated`.
- Seller tetap dapat mengubah `name`, `price`, `status` produknya.

**FINDING-4 tertutup:**
- Guard `SELF_PURCHASE_DENIED` pada `create_digital_order`.

**Migration:** 20261004090000 sampai 20261004095000 (6 versi, termasuk 3 koreksi desain).

**Temuan selama perbaikan:**
1. `REVOKE` per kolom tidak efektif selama grant tabel ada.
2. Mencabut grant tabel memblokir admin.
3. `available_stock` tidak boleh dikunci di trigger karena `recalc_code_stock` berjalan sebagai seller.
4. Fixture awal salah dua kali (role `customer` untuk seller, uji admin lewat UPDATE langsung) dan terdeteksi karena assertion gagal keras.

**Bukti:** `docs/remediation/2026-10-04-evidence-security-remediation.md`.

---

## Ringkasan angka

| Item | Jumlah |
| --- | --- |
| Migration diterapkan | 25 |
| Dokumen riset (ui-ux) | 11 |
| Dokumen framework (remediation) | 17 |
| Dokumen audit | 1 (pre-launch) |
| Test unit | 409 lulus |
| Test security baru | 12 kontrak |
| Launch blocker ditutup | 2 |
| Temuan Medium ditutup | 1 (FINDING-4) |

## Status gate akhir

```
BLOCK LAUNCH:        KOSONG (BLOCKER-1 dan BLOCKER-2 tertutup)
FIX BEFORE LAUNCH:   FINDING-5, refund cabut akses, FINDING-3 (belum)
REGRESSION:          12 test kontrak tersedia
ACCEPTED RISK:       claim_stock_code guard (tidak terekspos)
NOT VERIFIED:        CORS Supabase, rate limit auth, perilaku runtime RLS pasca-perbaikan
```

## Yang belum dikerjakan

1. **FINDING-5**: verifikasi kepemilikan `submit_payment_proof` di seluruh cabang.
2. **Refund mencabut akses**: pastikan `digital_entitlements.revoked_at` diisi saat refund.
3. **FINDING-3**: verifikasi proteksi brute force auth Supabase.
4. **Worker escrow**: pengaturan pelepasan otomatis sudah tersimpan dan terbaca, tetapi belum ada pengeksekusi terjadwal.
5. **Timeline detail order admin**: riwayat status sudah ada, belum digabung dengan pembayaran dan event jasa.
6. **Utang lama**: rate limit per IP, nonce CSP, security regression suite otomatis.
