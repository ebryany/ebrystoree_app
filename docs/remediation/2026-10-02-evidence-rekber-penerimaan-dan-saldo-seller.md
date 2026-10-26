# Evidence rekber, penerimaan digital, dan saldo seller

Tanggal: 2026-10-02. Scope: penahanan pendapatan digital sampai buyer menerima seluruh produk, refund release-aware, dan saldo seller/admin. Otorisasi implementasi: instruksi user `kerjakan` setelah framework selesai.

## Hasil

Source selesai. Database target linked `wcxaheqnnsbhifpgiedk` sudah menerima migration receipt `20261002120000` dan release `20261002130000` dalam satu transaksi. Build aplikasi lokal berhasil; aplikasi frontend tidak dipublish oleh pekerjaan ini. Server dan browser tidak dijalankan.

Pembayaran digital manual/QRIS membuat order paid dan receipt pending. Seller belum menerima sale credit. Acceptance buyer yang valid mengubah receipt accepted dan order completed, lalu menulis satu sale credit per store. Status completed tanpa receipt accepted tidak cukup untuk release. Kredit langsung service/internal memakai guard yang sama.

Refund sebelum release tidak mendebit seller. Refund aktif setelah release mencadangkan sisa sale; saat selesai, cadangan diganti debit final sekali. Penolakan refund pending kembali paid, bukan completed. Refund partial/mixed-credit/multi-store atau sale berfee yang belum mempunyai alokasi diblokir dengan `REFUND_ALLOCATION_REQUIRED`, bukan dihitung memakai tebakan. Kebijakan refund buyer existing tidak diubah.

## Preflight dan deployment

Preflight remote menunjukkan receipt table/RPC belum tersedia. Database mempunyai dua order digital completed legacy, satu cancelled, dua sale credit dengan total Rp2.000, tanpa refund atau mixed-credit order. Tidak ditemukan receipt pending yang perlu reversal historis.

Definisi fungsi existing disimpan dalam `.zcode/rekber-before-*.sql`; source UI/adapter awal ada di `docs/remediation/backups/rekber-20261002/`. Backup source enam file ini tidak mencakup `transaction.server.ts`. Snapshot ledger/order legacy sebelum dan sesudah deployment dibandingkan secara penuh tanpa mencantumkan identitas buyer dalam dokumen ini.

Helper `.zcode/rekber-db.mjs` memeriksa linked project melalui helper existing, hanya mengaktifkan batch jika kedua versi belum tercatat, mengunci tabel orders, memakai lock timeout 10 detik, lalu menerapkan kedua migration dan registry dalam satu transaksi.

Percobaan apply pertama berhenti sebelum perubahan database karena import helper lama menjalankan mode apply manual-payment yang sudah tercatat. Helper diperbaiki agar CLI hanya berjalan ketika dipanggil langsung. Percobaan kedua berhasil. Tidak ada migration manual yang diterapkan ulang.

Postflight:

- Dua registry migration tercatat dengan nama yang benar.
- `digital_order_receipts` dan `get_my_digital_receipt(uuid)` tersedia.
- Trigger `orders_credit_seller_on_paid` tetap satu, terikat ke fungsi release guarded.
- Delapan body fungsi finansial deployed cocok dengan migration setelah normalisasi akhir baris Windows.
- Authenticated boleh confirm; anon tidak boleh membaca RPC receipt; authenticated tidak boleh update receipt atau memanggil direct credit.
- Receipt produksi berjumlah nol setelah fixture rollback; legacy tidak diberi acceptance palsu.
- Snapshot dua order completed legacy dan seluruh ledger identik sebelum/sesudah deployment. Tidak ada backfill, reversal, atau penghapusan ledger historis.

## Kontrak saldo

`get_store_finances(uuid)` menjadi sumber hitungan seller/admin:

```text
ledger_balance = seluruh credit - debit
held_receipt = snapshot item paid, receipt pending, belum release/refunded
refund_reserved = sisa sale released terkait refund aktif
available_balance = ledger_balance - refund_reserved
```

Held tidak masuk available. `released_total` dan tren release 30 hari dihitung SQL dari seluruh ledger, bukan mutasi yang dibatasi pagination. Hari tren memakai UTC. `get_store_balance` menjaga signature bigint dan mendelegasikan available ke RPC yang sama. Admin list/detail memakai kontrak sama.

UI existing menampilkan Saldo tersedia, Ditahan menunggu penerimaan, dan Cadangan refund aktif. Loading/error melindungi header saldo; RPC failure tidak ditampilkan sebagai saldo nol sukses. Dialog acceptance menjelaskan release, tanpa menjanjikan payout atau menghilangkan hak refund. Refetch saat window kembali fokus memakai mekanisme query existing; tidak menambah polling atau publication. Tab yang terus terbuka tidak dijanjikan memperbarui held seketika tanpa event existing.

## Pengujian yang dijalankan

Fixture `.zcode/rekber-runtime.sql` dieksekusi PostgreSQL remote dalam BEGIN/ROLLBACK, sebelum dan setelah migration permanen. Fixture menggunakan actor existing, UUID test baru, claims scoped, serta role authenticated untuk acceptance dan RLS. Tidak mengirim transfer/provider webhook atau mengunggah file nyata. Storage readiness memakai row metadata fixture, bukan pembuktian bytes file dapat diunduh. Submit proof manual dilewati; fixture langsung menyediakan proof submitted, lalu memanggil verify approval.

| Area | Evidence | Status |
|---|---|---|
| Manual approval dan QRIS settlement | Paid/pending, tidak sale, held benar; QRIS settlement ulang tidak menggandakan entitlement | Lulus DB |
| Readiness code | Ready dapat diterima; code expiry, entitlement revoked/expired ditolak | Lulus DB |
| Readiness shared/unique | Missing Storage object ditolak; object tersedia ready; unique tanpa assignment tidak ready | Lulus DB |
| Acceptance | Owner authenticated confirm; duplicate aman; nonowner ditolak; completed tanpa acceptance tidak credit | Lulus DB |
| Payment dan permission | Unpaid ditolak; receipt RLS owner/nonowner; direct credit/write grants dibatasi | Lulus DB |
| Refund pending | Reject tetap paid; approve/process tidak seller debit | Lulus DB |
| Refund released | Reserve menurunkan available; reject tidak credit baru; process ulang satu debit final | Lulus DB |
| Alokasi ambigu | Partial dan mixed-credit gagal sebelum perubahan ledger | Lulus DB |
| Seller/admin dan agregat | Admin held sama; ownership guard; released total/trend sama dengan agregat SQL | Lulus DB |
| Legacy dan jasa | Legacy unchanged; jasa paid tetap credit sekali dan tidak membuat receipt digital | Lulus DB |
| Unit/source regression | 115 tests, 11 files, termasuk 6 tests rekber | Lulus |
| Build produksi | `npm run build` | Lulus |
| Lint scoped | 0 errors, 61 warnings, terutama any existing dan formatting | Lulus dengan warning |
| Typecheck | 70 errors; jumlah sama dengan baseline evidence receipt; error seller.functions berada di katalog public existing, bukan financial handler yang diubah | Gagal existing |
| Race dua sesi DB | Tidak tersedia sesi transaksi persisten melalui helper Management API per-query; tidak membuat fixture finansial permanen untuk race | Belum terverifikasi |
| GUI/mobile/keyboard/visual | Dilarang user menjalankan server/browser; hanya inspeksi source dan build | Tidak diuji |

Unit tests berisi regression source/simulasi. Evidence DB berasal dari fixture PostgreSQL, bukan dari unit assertions. Locks order pada confirm, request_refund, review, process, dan direct credit mengurutkan operasi per order, tetapi inspeksi itu tidak membuktikan race/deadlock runtime. Settlement manual/gateway existing masih mengambil payment sebelum order; tidak mengklaim seluruh sistem mempunyai urutan lock global seragam.

## Batas matriks framework

T-01, T-02, T-03, T-05, T-07, T-09 sampai T-12 dibuktikan untuk fixture di atas. T-04/T-06 dibuktikan untuk subset negative readiness/auth/payment yang tercantum. T-08 hanya duplicate sekuensial; dua sesi belum diuji. T-13 race belum diuji. T-14 ownership/admin parity/agregat diuji, bukan seluruh konfigurasi store. T-15 loading/error diperiksa dari source, tanpa GUI. T-16 legacy/jasa diuji; jalur akademik/platform khusus belum dieksekusi di fixture. T-17 partial/mixed diuji, multi-store/fee guard diperiksa source. T-18 evidence deployment tersedia; GUI tidak diklaim lulus.

Tidak ada timeout/auto-confirm. Buyer tidak mengonfirmasi berarti dana tetap ditahan. Payout, escrow legal, dispute engine, dan keputusan alokasi baru tetap di luar scope.

## Evidence lokal dan pemeriksaan ulang

- `.zcode/rekber-preflight.json`, `.zcode/rekber-predeploy.json`: pemeriksaan sebelum deployment.
- `.zcode/rekber-deploy.log`, `.zcode/rekber-postflight.json`: hasil deployment/definisi/grants.
- `.zcode/rekber-postdeploy-runtime.json`: hasil fixture terhadap fungsi permanen.
- `.zcode/rekber-verification.log`: parity delapan fungsi, registry, grants, dan snapshot legacy.
- `.zcode/rekber-unit.log`, `.zcode/rekber-build.log`, `.zcode/rekber-lint.log`, `.zcode/rekber-tsc.log`: hasil pemeriksaan source.

Snapshot/helper lokal tidak berisi token dalam output, tetapi snapshot ledger dapat memuat data internal. Jangan publish file `.zcode/` sebagai laporan publik.

```sh
npm run test:unit
npm run build
node .zcode/rekber-db.mjs test
node .zcode/rekber-verify.mjs
```

Dua perintah terakhir membutuhkan credential Supabase CLI lokal existing; token tidak ditulis ke source/dokumen. Verifier membandingkan artefak postflight tersimpan, bukan fetch live baru. Fixture test hanya mode rollback; jangan memakai apply untuk reapply migration tercatat.

## Rollback

Jangan mengembalikan kredit saat paid, drop receipt, menghapus acceptance/ledger, atau memaksa pending menjadi completed. Setelah fitur dipakai, pemulihan database wajib migration korektif yang menjaga penahanan dan histori. Backup fungsi lama adalah evidence, bukan skrip rollback aman untuk dijalankan seluruhnya.

## Gate delivery

Source, deployment, unit tests, dan build lulus sesuai evidence. Typecheck existing, concurrency, serta GUI tetap diberi status terpisah. Tidak ada klaim klik, visual acceptance, atau jaminan race. Perubahan UI memakai layout/komponen/direction ink-teal existing, ENERGY 1 / RHYTHM 2 / MOTION 1, tanpa aset, navigasi, warna, atau animasi baru. Angka berasal dari RPC database; copy hanya menjelaskan timing release/refund yang diimplementasikan.

R-17/R-36/R-38 PASS: klaim dan angka di atas bersumber dari artefak yang disebut. R-23/R-33 PASS: tidak membuat aset atau patch UI melalui skrip. R-27 PASS source: finance memiliki loading/error dan hasil kosong yang dibedakan dari failure. R-35 PASS build; click-through/contrast/mobile tidak dinilai karena batas user. Full visual delivery gate tidak diklaim lulus.
