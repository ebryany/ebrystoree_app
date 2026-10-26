# Evidence monitoring pesanan dan dana admin/seller

Tanggal: 2026-10-02.

Dasar: [analisis gap](../audit/2026-10-02-analisis-gap-admin-seller-dan-pengaturan-website.md), [framework MGRCAO V3](2026-10-02-mgrcao-v3-monitoring-pesanan-dan-dana-admin-seller.md). Scope implementasi: MON-01 sampai MON-04, bukan seluruh backlog analisis.

## Hasil source

- `supabase/migrations/20261002140000_order_monitoring.sql`: tiga fungsi read-only. Projection internal direvoke dari PUBLIC/anon/authenticated. Wrapper detail/list memvalidasi auth, scope, permission admin, owner toko, filter, dan page.
- `src/lib/order-monitoring.functions.ts`: server functions authenticated dan validasi Zod; error RPC menjadi error eksplisit. Cast SupabaseClient hanya pada pemanggilan RPC baru karena generated database types belum memuat migration baru, tanpa mengubah generated file.
- `src/components/ebry/order-monitoring.tsx`: filter antrean, counts SQL menyeluruh, pagination 15 order, umur tunggu, refresh, serta detail readiness/receipt/dana/refund. Dana order bukan saldo toko yang dapat ditarik.
- `src/routes/_authenticated/seller.pesanan.tsx`: monitoring dan disclosure detail pada halaman existing; daftar pesanan lama tetap tersedia.
- `src/routes/_authenticated/admin/index.tsx`: monitoring hanya ditampilkan untuk orders.view, tautan menuju detail order existing.
- `src/routes/_authenticated/admin/orders.$id.tsx`: panel receipt/readiness/dana hanya untuk digital_product.
- `src/lib/__tests__/order-monitoring.test.tsx`: empat regression checks source, bukan simulasi yang diklaim sebagai bukti PostgreSQL.

Tidak ada route/menu, dependency, asset, trigger, action acceptance/refund/release, atau kebijakan payout baru. Nominal refund pengajuan order hanya ditampilkan kepada admin; seller menerima status/tanggal dan debit refund tokonya, tanpa total refund seller lain. Payload tidak mengandung kode, Storage path, buyer user_id/contact, accepted_by, atau internal notes.

Readiness semua item menentukan apakah penerimaan order bisa menunggu buyer; item/dana yang ditampilkan seller tetap scope tokonya. Readiness sekarang tidak membatalkan acceptance historis dan tidak membuktikan actual download.

## Deployment database

Migration `20261002140000` diterapkan ke linked project existing setelah preflight dan transaksi test rollback. Migration registry dan ketiga body function terverifikasi sama dengan source. Tidak mengubah migration rekber sebelumnya.

Postflight grants:

| Role | Projection internal | Detail wrapper | List wrapper |
|---|---|---|---|
| authenticated | Tidak | Ya, auth/permission/owner guard | Ya, auth/permission/owner guard |
| anon | Tidak | Tidak | Tidak |

Snapshot penuh order, receipt, dan seller ledger tepat sebelum/sesudah deployment identik pada pemeriksaan apply dan postflight awal. Postflight akhir mendeteksi transaksi baru setelah deployment: satu order, satu receipt accepted, dan satu sale credit baru; seluruh baris baseline tetap identik. Tidak menghapus atau mengembalikan transaksi baru untuk memaksa snapshot global sama. Data baru bukan berasal dari fixture MONITOR/PAGE/TEST, tetapi sumber event eksternal belum diaudit. Runtime fixtures dijalankan dalam BEGIN/ROLLBACK sebelum dan setelah deployment. Tidak ada fixture transaksi produksi yang dipertahankan. Sequence database dapat bertambah walaupun transaksi rollback; kesamaan snapshot tidak berarti semua sequence tanpa efek.

Artifacts internal: `.zcode/monitoring-preflight.json`, `monitoring-before.json`, `monitoring-postflight.json`, `monitoring-runtime-result.json`, `monitoring-runtime.log`, `monitoring-postflight.log`. Snapshot mengandung data internal, bukan deliverable publik.

## Pengujian PostgreSQL yang dijalankan

Helper runnable: `node .zcode/monitoring-db.mjs test` (credential CLI existing, tidak mencetak token). Helper menjalankan regression rekber sebelumnya lalu monitoring fixture dalam satu transaksi rollback.

- Shared/unique/code readiness existing, accepted projection, code expiry dan entitlement revoked.
- Paid pending unavailable menjadi delivery_blocked; code assigned ready menjadi awaiting_receipt.
- Receipt accepted, timestamp dan sale release terpisah.
- Refund sebelum release: held menurut predicate existing, reserve nol, seller debit nol setelah completed.
- Refund setelah release: reserve remaining sale; completed refund menampilkan debit dan reserve nol.
- Refund approved dan processing tetap masuk refund_active.
- Sum held/reserve projection seller sama dengan get_store_finances existing dalam fixture.
- Authenticated seller owner bisa membaca; nonowner tidak dapat membaca order toko lain.
- Admin orders.view bisa membaca seluruh alokasi. Permission admin tidak dapat dipakai untuk bypass scope seller.
- Anon ditolak; internal RPC tidak executable bagi authenticated; scope/page invalid ditolak.
- Multi-store fixture: setiap seller menerima satu item/alokasi tokonya; admin menerima keduanya. Ini test isolasi monitoring, bukan dukungan checkout/refund multi-store baru.
- Pagination nyata dengan 16 order tambahan: counts/total menyeluruh, page pertama 15, page kedua tidak kosong, tidak duplikasi, urutan deterministik. Baseline order diblokir dihitung, bukan diasumsikan nol.
- Legacy completed tanpa receipt tetap tidak mempunyai accepted buatan.
- Query read-only serta snapshot order/receipt/ledger setelah rollback tidak berubah.
- Regression pembayaran manual/QRIS, refund/guard, authenticated receipt, dan non-digital service sebelumnya dijalankan ulang.

Batas: metadata Storage bukan bukti actual file bytes dapat diunduh. Tidak menguji real gateway transfer/webhook, concurrency dua sesi, atau semua layanan akademik/platform khusus. Monitoring list memproyeksikan seluruh order digital yang scoped sebelum pagination; performa volume besar belum dibenchmark. Index/materialization tambahan menunggu evidence volume, bukan ditambahkan spekulatif.

## Source checks

- Unit: 119 tests lulus, 12 files, termasuk empat monitoring regression checks.
- Production build: lulus, frontend dan server bundles dibuat. Tidak menjalankan dev/preview server.
- Typecheck: 70 error, sama dengan baseline `.zcode/rekber-tsc.log`; tidak ada error line baru pada monitoring/integrasi.
- Lint seluruh workspace: 0 errors, 8203 warnings pada saat run setelah build. Angka ini mencakup scope workspace yang lebih luas; tidak diklaim sebagai baseline source lama. Lint scoped files baru setelah formatting: 0 errors/warnings. Warning existing pada route integrasi tidak diformat massal.
- Build masih memberi warning inputValidator deprecated yang juga digunakan pola existing. Bukan build failure.
- Contrast script `.zcode/monitoring-contrast.mjs`: foreground, muted-foreground, primary terhadap card, serta foreground/background lulus 4.5:1 pada light/dark. Rasio terendah pasangan baru yang dihitung: 5.93:1. Ini perhitungan token, bukan verifikasi seluruh badge/buttons existing atau halaman rendered.

Artifacts: `.zcode/monitoring-unit.log`, `monitoring-build.log`, `monitoring-tsc.log`, `monitoring-lint.log`, `monitoring-lint-new.log`, `monitoring-lint-scoped.log`, `monitoring-contrast.log`.

## Gate UI dan batas verifikasi

Direction mengikuti DESIGN.md, ENERGY 1 / RHYTHM 2 / MOTION 1. List operasional menjadi fokus; detail native disclosure mencegah kebutuhan route/dialog baru. Token dan font existing menjaga keterbacaan, angka tabular, flex-wrap/grid responsif menjaga reflow. Tanpa dekorasi/asset baru.

PASS source inspection: loading/error/empty tersedia; query error tidak menampilkan fallback dana nol. Kontrol refresh memanggil refetch, filter mengubah query/reset page, pagination mengubah page, detail admin menuju route existing, summary native membuka detail seller, Kelola produk menuju form existing. Focus-visible dan min-height 44px pada kontrol baru. Source regression dan contrast token merupakan evidence terbatas, bukan click-through.

BELUM DIVERIFIKASI GUI: mobile 390px, zoom 200%, keyboard nyata, seluruh theme rendered, console, serta click-through. User melarang menyalakan server dan browser-use; larangan dipertahankan. Tidak mengklaim visual acceptance/full delivery gate lulus. Frontend belum dipublish.

## Rollback dan backlog

Rollback monitoring tidak menyentuh dana: hapus konsumsi komponen/server functions pada frontend dahulu, lalu drop list_order_monitoring(text,text,integer), get_order_monitoring(uuid,text), dan order_monitoring_rows(uuid,uuid) jika dibutuhkan. Jangan membatalkan release/receipt migration sebelumnya atau mengoreksi ledger legacy.

SET-01/SET-02, REP-01, OPS-01, SEL-01 tetap backlog; tidak ada perubahan pengaturan, laporan agregat, scheduler, payout, fee, SLA, timeout, auto-confirm, dispute engine, atau submission bukti refund seller. Tidak commit/push/publish.
