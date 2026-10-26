# Evidence perbaikan penerimaan produk digital

Tanggal: 2026-10-02.
Status: source diimplementasikan; migration belum diterapkan. Bukan klaim fitur aktif atau lolos end-to-end.
Dasar: [riset](../audit/2026-10-02-riset-penerimaan-produk-digital.md) dan [MGRCAO V3](2026-10-02-mgrcao-v3-penerimaan-produk-digital.md).
Otorisasi implementasi: instruksi owner “lanjut perbaikan”. Otorisasi deploy receipt belum diberikan.

## Perubahan scoped

- Migration `supabase/migrations/20261002120000_digital_order_receipt.sql`: tabel satu receipt per order, RLS owner read, tanpa direct buyer write atau backfill legacy.
- Manual dan QRIS: cabang digital menjadi order paid, completed_at kosong, receipt pending. Payment/invoice tetap paid; entitlement, allocator, jasa/akademik, payment guard, task/history/audit dipertahankan.
- Readiness semua item: entitlement milik buyer dan item/product/order yang benar, belum dicabut/kedaluwarsa; mode snapshot konsisten dengan resolver katalog. Shared harus memiliki object Storage pada file aktif terbaru. Unique harus aktif dan assigned ke entitlement yang tepat dengan object Storage. Code harus assigned, nonempty dan belum kedaluwarsa.
- `confirm_digital_receipt`: auth owner, order/receipt/entitlement lock, payment paid, seluruh item siap, tanpa refund aktif. Menyimpan accepted_by/accepted_at, completed_at, history/notification/audit dalam satu transaksi. Pengulangan pada accepted/completed mengembalikan duplicate tanpa menulis efek kedua.
- `review_refund`: order lock; reject receipt pending kembali paid. Accepted/legacy tetap mengikuti cabang completed existing. Nominal/window/process_refund tidak diubah.
- Server functions receipt/code memakai auth middleware dan RPC owner checks. Pustaka menambah filter user_id eksplisit dan delivery_mode.
- Detail pesanan: status penerimaan, daftar kesiapan item, link pustaka, reload status, dialog konfirmasi, error/busy state; refund existing tetap tersedia sesuai status.
- Pustaka: kode/link diambil hanya saat diminta, tidak memakai kuota file. Teks di-escape React; hanya HTTP/HTTPS menjadi link. Tersedia link detail pesanan untuk acceptance. Error request tidak meninggalkan busy state.
- Label/timeline global, ledger/trigger earnings, stock ingestion, PO/jasa dan migration historis tidak diedit.

Receipt bukan held-funds escrow, release, atau payout. Seller tetap dikredit saat paid. Pemeriksaan readiness tidak mengambil stock atau mengonsumsi kuota. Kuota habis setelah pengunduhan tidak dianggap penolakan receipt bila entitlement dan pengiriman masih valid. Link eksternal tidak dibuka/diperiksa; kesiapan code adalah assignment yang valid, bukan bukti konten layanan eksternal sesuai.

Jika mode katalog berubah dari snapshot pembelian, receipt tidak dapat dikonfirmasi, bukan diam-diam menerima mode baru. Alokasi stock tetap menggunakan jalur existing; receipt tidak menambahkan retry allocator.

## Verifikasi yang benar-benar dijalankan

| Pemeriksaan | Hasil | Batas evidence |
|---|---|---|
| `npm run test:unit` | PASS, 109 test / 10 file | 22 test receipt baru; helper runtime dan SQL/UI static regression, bukan DB/GUI |
| Lint delapan file scoped | PASS exit 0, 0 error, 1084 warning | Warning formatting/CRLF dan any pada file existing tetap dilaporkan; tidak diformat ulang massal |
| Lint empat file baru dengan `--max-warnings 0` | PASS, 0 warning | Type/helper, dua komponen, test receipt |
| `npm run build` | PASS exit 0 | Build produksi; tidak menyalakan server. Warning inputValidator deprecated dan vite-tsconfig-paths tetap ada |
| `npx tsc --noEmit` seluruh proyek | FAIL exit 2, 70 diagnostic | Semua diagnostic di luar file slice receipt; tidak ada diagnostic pada file receipt/scoped yang diubah |
| Diff empat file existing terhadap backup | PASS inspection | Perubahan tetap scoped; bukan bukti runtime |
| DB migration/acceptance runtime | BELUM DIJALANKAN | Tidak ada deploy atau query remote receipt pada pekerjaan ini |
| GUI/mobile/keyboard/tema | BELUM DIJALANKAN | Browser dilarang owner; tidak menggunakan workaround |

Run unit awal sempat gagal pada dua assertion parity karena judul notifikasi belum dinetralkan untuk code/shared yang belum siap. Judul diperbaiki menjadi “Akses produk disiapkan”; seluruh 109 test kemudian lulus. Test parity membandingkan definisi manual/QRIS dengan definisi sebelumnya setelah hanya perubahan cabang digital dan notifikasi yang ditentukan.

Log lokal:
- `.zcode/digital-receipt-unit.log`
- `.zcode/digital-receipt-lint.log`
- `.zcode/digital-receipt-build.log`
- `.zcode/digital-receipt-tsc.log`

## Acceptance dan gate UI

- PASS source: dialog explicit acceptance, RPC owner-scoped, pending/accepted/loading/error/no-receipt states, failure di dialog, busy reset dengan finally, reload/invalidation tersedia.
- PASS source: stok code ditampilkan sebagai escaped text; skema javascript/data/file/FTP dan relative URL tidak menjadi tautan. Unit test helper dijalankan.
- PASS source: kontrol baru menggunakan Button/AlertDialog existing, target min-h-11, wrapping daftar/action dan break-all pada code. Bukan verifikasi render 390px atau kontras.
- PASS source: tidak ada angka fiktif, testimonial, aset baru, dekorasi, auto-confirm atau klaim release dana.
- BELUM TERVERIFIKASI: klik-through, focus/Escape, tampilan mobile, kontras dan dua tema. Gate visual/interaksi tidak dinyatakan PASS; source bukan UI yang sudah disetujui secara visual.

Arah desain mengikuti DESIGN.md: halaman buyer/data, ink-teal existing, ENERGY 1 / RHYTHM 2 / MOTION 1. Section penerimaan ditempatkan dekat timeline agar keputusan penyelesaian terpisah dari pembayaran. Border/bg-card/typography mengikuti halaman existing agar bukan redesign. Accent hanya pada aksi konfirmasi; dialog membatasi salah klik. Tidak ada icon/asset/motion tambahan.

## Batas pengujian DB

Belum dibuktikan di DB: fungsi/schema dapat dieksekusi, RLS grants efektif, Storage readiness, owner/nonowner, unpaid/cancelled/refund/revoked/expired, multi-item, settlement dua rail, duplicate dan concurrent confirmation, refund race, ledger tidak ganda, serta service/academic regression. Static assertion tidak membuktikan hasil-hasil tersebut.

Migration receipt tidak applied; jangan menyatakan lifecycle baru aktif. Order completed lama tidak dibuatkan receipt. UI baru memerlukan migration ini sebelum RPC receipt/code dapat berfungsi. Tidak menjalankan `.zcode/manual-payment-db.mjs apply`, karena mode tersebut khusus migration manual sebelumnya.

Tidak ada server yang dinyalakan/restart/stop, browser, agen baru, dependency baru, atau perubahan AGENTS.md. Backup source existing tersimpan di `docs/remediation/backups/digital-receipt-20261002/`.

## Rollback

Source dapat dikembalikan dari backup scoped sebelum deploy. Setelah migration dipakai, rollback DB tidak boleh menghapus receipt/acceptance/ledger nyata atau otomatis menyelesaikan order pending. Deploy dan pemulihan DB membutuhkan otorisasi terpisah.
