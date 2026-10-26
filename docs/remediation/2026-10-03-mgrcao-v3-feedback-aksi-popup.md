# MGRCAO V3: feedback aksi dengan pop up beranimasi

Tanggal: 2026-10-03. Dasar: [riset feedback aksi popup](../ui-ux/2026-10-03-riset-feedback-aksi-popup.md). Status: dikerjakan.

## M: Mindset

Umpan balik bukan hiasan, melainkan jaminan bahwa pengguna tahu apa yang terjadi. Tiga prinsip:

1. **Setiap aksi berdampak harus punya hasil yang terlihat.** Bukan hanya tombol berubah, tetapi konfirmasi yang bisa dibaca.
2. **Bobot umpan balik mengikuti bobot aksi.** Toast untuk aksi ringan, dialog hasil untuk aksi berdampak. Modal untuk hal sepele adalah kegagalan.
3. **Animasi mengarahkan perhatian, bukan mengisi waktu.** Masuk dengan fade + gerak kecil; hormati `prefers-reduced-motion`.

Sonner sudah dipakai dan tepat untuk toast; jangan diganti. Yang ditambah adalah dialog hasil untuk aksi berdampak dan animasi state lokal yang konsisten.

## G: Goal

1. Komponen `ActionResultDialog` dengan empat status: loading, success, error, partial.
2. Alur simpan pengaturan memakai dialog hasil: konteks perubahan tidak hilang saat gagal.
3. Aksi lanjutan setelah sukses (mis. "Lihat audit").
4. Animasi konsisten: bilah simpan mengambang, dropdown pencarian, panel dampak.
5. `window.confirm` pada aksi berisiko diganti dialog yang dapat dibaca.
6. Toast tetap untuk aksi ringan; tidak menambah modal yang tidak perlu.
7. Aksesibilitas: `role="alertdialog"` untuk hasil, fokus terkelola, Escape menutup, reduced motion dihormati.

## R: Role

Frontend/UI/UX Specialist untuk dashboard admin marketplace, bekerja sendiri tanpa spawn agent. Mandat: `src/components/admin/action-result-dialog.tsx` (baru), `src/routes/_authenticated/admin/settings.website.tsx`, dan komponen admin lain bila diperlukan untuk konsistensi. Tidak menyentuh server function, database, atau logika bisnis.

## C: Constraints

- Tanpa dependency baru; gunakan `motion/react`, Dialog, dan Button existing.
- Dialog hasil tidak menutup otomatis pada sukses berdampak.
- Tidak mengubah perilaku simpan, validasi, atau izin.
- Reduced motion: animasi dimatikan, bukan dipercepat.
- Target sentuh 44px, focus ring terlihat, Escape menutup dialog.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Buat `ActionResultDialog`: status loading/success/error/partial, ikon beranimasi, ringkasan, aksi lanjutan opsional, tombol tutup.
2. Integrasikan ke alur simpan pengaturan: dialog dampak berubah menjadi status saat menyimpan, sukses menampilkan ringkasan + "Lihat audit", gagal menampilkan "Coba lagi" tanpa kehilangan konteks.
3. Integrasikan ke alur reset.
4. Animasi bilah simpan mengambang (slide up/down) dan dropdown pencarian (fade + slide).
5. Ganti `window.confirm` reset dengan dialog konfirmasi beranimasi.
6. Test kontrak: status dialog, integrasi alur, aksesibilitas, reduced motion.
7. Verifikasi browser dan evidence.

## O: Acceptance

- Menyimpan pengaturan menampilkan dialog hasil dengan status yang jelas.
- Simpan gagal tidak menutup dialog; pengguna dapat mencoba lagi dengan konteks utuh.
- Sukses menyediakan aksi lanjutan yang nyata (bukan tombol mati).
- Bilah simpan dan dropdown pencarian beranimasi halus dan hormat reduced motion.
- Reset memakai dialog, bukan `window.confirm`.
- Toast tetap dipakai untuk aksi ringan.
- Dialog dapat ditutup dengan Escape dan fokus kembali ke pemicu.
- Tests/build dilaporkan apa adanya.
