# MGRCAO V3: pengaturan website konteks marketplace

Tanggal: 2026-10-03. Dasar: [riset pengaturan website marketplace](../ui-ux/2026-10-03-riset-pengaturan-website-marketplace.md). Status: dikerjakan.

## M: Mindset

Pengaturan adalah tempat pemilik produk memegang kendali, bukan tempat menampilkan semua yang mungkin. Setiap field harus benar-benar berpengaruh, punya default yang aman, dan jujur menyatakan batasnya.

Dua kesalahan yang harus dihindari:

1. Menampilkan field yang tidak terhubung ke sistem apa pun. Itu pengaturan palsu.
2. Menyembunyikan bahwa suatu nilai ditegakkan di database. Itu menyesatkan.

Selain itu, tata kelola izin adalah bagian dari produk: jika hanya super_admin yang efektif dapat menyimpan karena permission tidak terdaftar, maka pembagian tugas tidak nyata.

## G: Goal

1. Sembilan permission pengaturan terdaftar di database dengan pemetaan peran yang jelas.
2. Bagian **Marketplace** baru berisi aturan jasa, escrow, moderasi, kebijakan seller, dan refund.
3. Setiap field Marketplace membaca `system_settings` dengan fallback ke default; perilaku tidak berubah sampai admin mengubahnya.
4. Field yang belum dapat diubah ditandai jujur, bukan dipalsukan.
5. UI/UX: pengelompokan, pencarian, status bagian, indikator publik, ringkasan dampak, preview sticky.
6. Tidak ada regresi: pengaturan lama tetap bekerja dengan izin yang benar.

## R: Role

Security Engineer dan Frontend/UI/UX Specialist, bekerja sendiri tanpa spawn agent. Mandat:

- Migration baru: permission pengaturan, pemetaan peran.
- `src/lib/website-settings.ts`: bagian Marketplace dan metadata baru (group, public indicator).
- `src/lib/website-settings.functions.ts`: pembacaan setting marketplace.
- `src/routes/_authenticated/admin/settings.website.tsx`: UI/UX.
- `src/lib/marketplace-service.ts` dan server function terkait: membaca batas dari setting dengan fallback.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh jalur uang, lifecycle, atau constraint SQL yang sudah diterapkan.

## C: Constraints

- Jangan mengedit migration yang sudah diterapkan.
- Default setiap field Marketplace harus **sama persis** dengan nilai hardcoded saat ini, sehingga tidak ada perubahan perilaku diam-diam.
- Nilai yang ditegakkan constraint SQL tidak boleh diklaim dapat diubah; tandai sebagai terikat database.
- Jangan melemahkan validasi: setting baru tetap divalidasi rentangnya.
- UI harus tetap dapat dioperasikan keyboard, target 44px, dan hormati reduced motion.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

### Fase 1: Tata kelola izin

1. Migration: daftarkan `settings.website.update`, `settings.contact.update`, `settings.navigation.update`, `settings.seo.update`, `settings.commerce.update`, `settings.payment.update`, `settings.features.update`, `settings.maintenance.update`, dan `settings.marketplace.update` (baru).
2. Pemetaan: admin mendapat website/contact/navigation/seo; super_admin mendapat semuanya termasuk commerce/payment/features/maintenance/marketplace.
3. Verifikasi: `has_permission` benar untuk kedua peran; bypass super_admin tidak lagi diperlukan untuk kasus normal.

### Fase 2: Bagian Marketplace

4. Tambah bagian `marketplace` dengan field terkelompok: media & berkas, aturan jasa, escrow, moderasi, kebijakan seller, refund.
5. Setiap field punya default identik dengan nilai hardcoded sekarang.
6. Tandai field yang ditegakkan database dengan `help` yang jujur.
7. Hubungkan nilai yang dapat dibaca: ukuran unggah media, batas media, batas halaman toko.

### Fase 3: UI/UX

8. Subjudul kelompok di dalam bagian.
9. Pencarian field lintas bagian.
10. Titik status di sidebar untuk bagian yang punya perubahan belum disimpan.
11. Indikator publik/privat per field.
12. Penanda "diubah dari default" memakai `storedKeys`.
13. Ringkasan dampak sebelum menyimpan bagian berisiko.
14. Preview sticky di kolom kanan pada layar lebar.
15. Test dan evidence.

## O: Acceptance

- Permission pengaturan terdaftar; admin dapat menyimpan bagian yang menjadi tanggung jawabnya tanpa bypass.
- Bagian Marketplace tampil dengan pengelompokan dan default yang tidak mengubah perilaku.
- Field yang terikat database ditandai jujur.
- Pencarian menemukan field lintas bagian.
- Sidebar menunjukkan bagian yang punya perubahan belum disimpan.
- Setiap field menampilkan apakah nilainya publik.
- Keyboard-only dapat menelusuri dan menyimpan; reduced motion dihormati.
- Tests/build dilaporkan apa adanya.
