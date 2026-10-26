# Evidence: redesain admin moderasi jasa

Tanggal: 2026-10-03.

## Implementasi

Halaman `src/routes/_authenticated/admin/seller.jasa.tsx` memakai header admin existing, dua panel Radix Tabs yang mengikuti permission, kartu moderasi/komplain, StatusPill, skeleton/error/empty, refresh, serta pagination dengan total server. Panel forceMount tetap tersembunyi ketika tidak aktif sehingga alasan keputusan tidak hilang saat berpindah tab.

Agreement terbuka awal dan dapat dilipat dengan aria-expanded/aria-controls. Scope komplain tidak dipotong. Textarea terkunci saat mutation pending, alasan minimal lima karakter. Refund penuh memakai dialog konfirmasi dengan alasan yang akan dikirim. Target kontrol halaman minimal 44px. Server functions/database/policy checkout dan refund tidak berubah.

## Verifikasi executable

- PASS: ESLint untuk halaman dan regression test (exit 0).
- PASS: npm run test:unit, 21 file, 296 tes termasuk empat regression source-contract baru.
- PASS: npm run build (exit 0), client/server bundle dihasilkan.
- Typecheck global belum lulus: 72 error di file unrelated, sama dengan jumlah yang tercatat sebelum tahap ini. Nol diagnostic di halaman admin jasa dan test barunya.

Log lokal: `.zcode/admin-jasa-unit.log`, `.zcode/admin-jasa-build.log`, `.zcode/admin-jasa-typecheck.log`.

## Pemeriksaan kontrol melalui source

- Tabs: primitive Radix menyediakan navigasi keyboard/relasi panel; akses services/orders menentukan tab yang ditampilkan.
- Agreement: button toggles state, aria-expanded dan panel ID terhubung.
- Refresh/retry: memanggil query.refetch; refresh terkunci saat fetch/mutation.
- Pagination: setPage, batas halaman dan pending/fetch guard.
- Approve/reject: memanggil mutation existing dengan ID, expectedVersion dan alasan; disabled jika alasan belum cukup atau mutation pending.
- Resume: mutation existing tetap dibatasi izin orders.update.
- Refund: trigger membuka AlertDialog; Batal membatalkan; action konfirmasi memanggil mutation existing. Tidak melakukan refund nyata selama verifikasi.

## Batas acceptance

Pemeriksaan di atas berbasis source dan build, bukan click-through browser. GUI, console browser, responsivitas visual, kontras light/dark, fokus aktual serta perubahan database setelah keputusan belum diuji. Tidak mengklaim visual acceptance/Delivery Gate lulus. Tidak menjalankan browser, server baru, agen, keputusan moderasi nyata, commit, push, atau deployment.
