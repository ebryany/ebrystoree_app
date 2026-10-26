# Riset: feedback aksi dengan pop up beranimasi

Tanggal: 2026-10-03. Scope: seluruh aksi pengguna di dashboard admin, dengan fokus halaman pengaturan website. Metode: pembacaan source pola feedback yang ada, inventaris titik aksi, dan penelusuran konfigurasi Sonner. Tidak ada perubahan kode pada tahap riset ini.

## 1. UX yang dimaksud

Pengguna meminta: setiap aksi harus memberi pop up, baik berhasil maupun gagal, dengan animasi, supaya terasa lebih kuat.

Yang sebenarnya dibutuhkan bukan sekadar "pop up di mana-mana". Yang dibutuhkan adalah **umpan balik yang jelas, cepat, dan tidak ambigu** untuk setiap tindakan yang punya konsekuensi. Tiga hal yang membuat umpan balik terasa kuat:

1. **Pasti terlihat.** Pengguna harus tahu aksinya diproses, berhasil, atau gagal, tanpa harus mencari.
2. **Sesuai bobot aksi.** Menyalin tautan cukup toast kecil; menyimpan konfigurasi uang layak mendapat konfirmasi lebih tegas.
3. **Tidak mengganggu.** Terlalu banyak modal untuk aksi ringan justru melelahkan. Modal untuk hal sepele adalah kegagalan UX, bukan peningkatan.

## 2. Kondisi sekarang (terverifikasi)

- Aplikasi memakai **Sonner** (`<Toaster position="top-center" richColors />` di root).
- 46 file memakai `sonner`, dengan 102 pemanggilan `toast.success`/`toast.error` di halaman admin saja.
- Toast sudah muncul untuk sukses dan gagal, dan sudah dianimasikan bawaan Sonner (slide + fade).

Jadi masalahnya **bukan tidak ada feedback**, melainkan:

### 2.1 Tidak ada status "sedang diproses" yang menonjol

Saat menyimpan pengaturan, tombol berubah menjadi "Menyimpan…" dan disabled. Itu cukup, tetapi tidak ada indikator progres yang terlihat bila tombol sudah tergulir keluar layar (kasus bagian panjang).

### 2.2 Sukses tidak menutup dialog

Dialog dampak ditutup manual sebelum simpan (`setImpactOpen(false); commitSave()`). Bila simpan gagal, dialog sudah hilang dan pengguna kehilangan konteks perubahan yang tadi ditinjau.

### 2.3 Tidak ada konfirmasi hasil yang bisa ditindaklanjuti

Toast sukses hanya berbunyi "3 pengaturan disimpan." Tidak ada aksi lanjutan seperti "Lihat audit" atau "Kembalikan".

### 2.4 Tidak ada animasi pada perubahan state lokal

Aksi lokal seperti membuka panel, memilih tab, atau menghapus perubahan belum disimpan terjadi seketika tanpa transisi. Halaman terasa "melompat".

### 2.5 Umpan balik tidak konsisten antarbagian

Sebagian aksi memakai `window.confirm` (blokir browser), sebagian `toast`, sebagian dialog. Tidak ada satu pola yang dapat diprediksi pengguna.

## 3. Rancangan yang diusulkan

### 3.1 Tiga tingkat umpan balik

| Tingkat | Dipakai untuk | Bentuk |
| --- | --- | --- |
| **Toast** | Aksi ringan, hasil tunggal | Sonner dengan ikon, durasi 4 detik, animasi bawaan |
| **Dialog hasil** | Aksi berdampak (simpan pengaturan, reset, aksi uang) | Modal dengan status, ringkasan, dan aksi lanjutan |
| **Inline status** | Aksi panjang (unggah berkas) | Baris status di dekat kontrol |

Aturan: aksi yang mengubah konfigurasi uang, fitur, atau marketplace mendapat **dialog hasil**; aksi ringan tetap toast.

### 3.2 Dialog hasil aksi

Komponen baru `ActionResultDialog` dengan empat status:

- `loading`: spinner + teks progres
- `success`: ikon centang beranimasi + ringkasan + aksi lanjutan
- `error`: ikon peringatan + pesan + tombol "Coba lagi"
- `partial`: sebagian berhasil, dengan rincian

Dialog tidak menutup otomatis pada sukses berdampak; pengguna menutup sendiri setelah membaca. Animasi masuk: fade + scale kecil, hormati `prefers-reduced-motion`.

### 3.3 Perbaikan alur simpan pengaturan

1. Dialog dampak **tetap terbuka** selama proses simpan dan berubah menjadi status.
2. Sukses: dialog berubah menjadi status sukses dengan ringkasan jumlah perubahan dan tombol "Lihat audit" serta "Tutup".
3. Gagal: dialog berubah menjadi status error dengan pesan dan tombol "Coba lagi", sehingga konteks perubahan tidak hilang.

### 3.4 Animasi pada perubahan state lokal

- Panel dampak dan dropdown pencarian: fade + slide kecil.
- Perubahan daftar hasil pencarian: `AnimatePresence` agar tidak berkedip.
- Bilah simpan mengambang: slide up saat muncul, slide down saat hilang.
- Semua animasi hormati `useReducedMotion`.

### 3.5 Konsistensi

- Ganti `window.confirm` pada aksi berisiko dengan dialog yang dapat dibaca dan beranimasi.
- Satu pola pemanggilan: helper `notifySuccess` / `notifyError` agar pesan seragam.

## 4. Batas

- Tidak mengganti Sonner dengan library lain; ia sudah tepat untuk toast ringan.
- Tidak menambahkan modal untuk aksi yang tidak berdampak; itu memperburuk UX.
- Tidak mengubah logika server; hanya penyajian hasil.
- Setiap animasi harus punya alasan (mengarahkan perhatian), bukan hiasan.

## 5. Kesimpulan

Fondasi toast sudah baik. Yang perlu ditambah adalah **dialog hasil untuk aksi berdampak**, status proses yang tetap terlihat, aksi lanjutan setelah sukses, dan animasi yang konsisten pada perubahan state. Aksi ringan tetap memakai toast supaya tidak melelahkan.

Framework kerja: `docs/remediation/2026-10-03-mgrcao-v3-feedback-aksi-popup.md`.
