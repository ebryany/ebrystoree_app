# Riset redesain UI/UX halaman pesanan jasa seller

Tanggal: 2026-10-03. Scope: `/seller/jasa-pesanan`. Metode: pembacaan source halaman (689 baris), komponen shared yang tersedia, benchmark internal `seller.pesanan.tsx` + `SellerOrderCard`, dokumen arah desain dan riset redesain seller yang sudah ada, serta pengamatan snapshot DOM live. Tidak ada perubahan kode pada tahap riset ini.

## 1. Gambaran halaman saat ini

Halaman ini adalah daftar kerja seller untuk pesanan jasa. Alur kerjanya: pesanan masuk setelah checkout aktif, seller menyetujui requirements, mengerjakan, lalu mengirim hasil (tautan, catatan, atau berkas). Dana ditahan sampai pembeli menerima.

Struktur saat ini sudah cukup lengkap: header + tombol Muat ulang, pill tabs dengan indikator bergeser dan hitungan, hint tab, skeleton/error/empty state, kartu pesanan dengan status pill, indikator urgensi tenggat, peringatan komplain, dan panel detail yang bisa dibuka berisi agreement, kebutuhan pembeli, aksi setujui, form kirim hasil, dan riwayat hasil.

Jadi masalahnya bukan "tidak ada UI", melainkan **arah visual dan kepadatan informasi**. Istilah pengguna: "look-nya masih basic".

## 2. Diagnosis: kenapa terasa basic

### 2.1 Tidak ada hierarki keputusan

Halaman ini sebenarnya satu layar keputusan: **"pesanan mana yang harus saya kerjakan sekarang?"** Namun kartu tidak mengarahkan ke jawaban itu.

- Semua kartu berbobot visual sama. Pesanan yang menunggu persetujuan requirements, yang sedang dikerjakan, dan yang menunggu pembeli terlihat nyaris identik.
- Aksi berikutnya tidak terlihat dari kartu tertutup. Seller harus membuka Detail untuk tahu apakah ia perlu menyetujui requirements, mengirim hasil, atau hanya menunggu.
- Tab "Perlu tindakan" mencampur `awaiting_requirements` **dan** `in_progress`. Dua keadaan itu butuh aksi berbeda (setujui vs kerjakan/kirim hasil), tetapi dihitung sebagai satu kelompok.

### 2.2 Informasi penting tenggelam

- Tenggat (`due_at`) hanya muncul sebagai teks kecil, dan hanya berubah warna kartu bila kurang dari 24 jam. Tidak ada sinyal "hari ini", "besok", atau "sudah lewat" yang menonjol.
- Nilai uang (`total`) hanya teks abu-abu di baris metadata, padahal ini pesanan bernilai.
- Jumlah revisi (`0/1 revisi`) hanya teks kecil di kanan; saat revisi diminta, tidak ada penekanan bahwa ada pekerjaan tambahan.
- Status `work_state` benar secara data, tetapi tidak menjelaskan "apa artinya bagi saya" (misalnya "menunggu data pembeli" vs "menunggu Anda mengirim hasil").

### 2.3 Detail padat dan datar

Saat kartu dibuka, seluruh isi muncul sekaligus: agreement (4 field), kebutuhan pembeli, aksi, form pengiriman (radio + input + textarea), dan riwayat hasil. Tidak ada pemisahan bagian, tidak ada ringkasan, dan form pengiriman tampil sama datarnya dengan teks informasi.

- Agreement dan kebutuhan pembeli ditampilkan sebagai daftar definisi polos tanpa wadah.
- Tidak ada penanda bagian "yang perlu Anda lakukan" versus "informasi".
- Riwayat hasil hanya dot + teks, tidak menunjukkan jenis hasil (tautan/catatan/berkas) dengan pembeda visual.

### 2.4 Inkonsistensi dengan halaman seller lain

Benchmark `seller.pesanan.tsx` + `SellerOrderCard` sudah punya bahasa visual yang lebih matang:

| Aspek | seller.pesanan (benchmark) | seller.jasa-pesanan (sekarang) |
| --- | --- | --- |
| Nomor pesanan | mono, tebal, di kepala kartu | teks biasa di baris metadata |
| Antrean kerja | kotak berlabel "apa yang menunggu" | tidak ada |
| Kesiapan/status per item | badge per item | tidak ada |
| Ringkasan dana | baris "Ditahan / Dilepas / Cadangan" | tidak ada (hanya total) |
| Kerangka kartu | kepala, isi, kaki terpisah jelas | satu blok mengalir |

Akibatnya dua halaman seller terasa seperti dua produk berbeda.

### 2.5 Detail teknis yang memperkuat kesan "basic"

- Kartu memakai `shadow-sm` pada setiap kartu; bayangan jadi dekorasi, bukan penanda elevasi.
- Tidak ada pemisah visual antara "informasi" dan "aksi" di dalam detail.
- `DeliveryForm` menampilkan radio pilihan jenis hasil, lalu input yang berubah; untuk seller yang sering mengirim berkas, langkah ini terasa berat.
- Ikon yang dipakai seragam dari satu library tanpa peran yang membedakan antar bagian.
- Hint tab hanya satu baris teks abu-abu, tidak membantu menjawab "apa arti status ini".

## 3. Prinsip arah baru

Arah desain Ebrystore: Friendly · Fast · Simple · Trustworthy · Mobile-First · Transaction-Focused. Untuk halaman kerja seller, terjemahannya:

1. **Kerja dulu, riwayat kemudian.** Yang butuh tindakan naik; yang menunggu pembeli turun.
2. **Satu kartu, satu jawaban.** Dari kartu tertutup, seller langsung tahu: apa keadaannya, apa langkah berikutnya, dan berapa nilainya.
3. **Uang dan tenggat terlihat.** Keduanya penentu keputusan seller, bukan metadata.
4. **Detail berlapis.** Ringkasan → kebutuhan pembeli → aksi → riwayat, dengan pemisah yang jelas.
5. **Konsisten dengan `seller.pesanan`.** Satu bahasa visual untuk seluruh dashboard toko.
6. **Mobile-first.** Satu kolom, target sentuh 44px, tanpa geser horizontal yang tidak perlu.

Design Read untuk halaman ini: *daftar kerja seller marketplace, untuk penjual yang memantau beberapa pesanan sekaligus, dengan bahasa visual dashboard transaksional, dial ENERGY 1 / RHYTHM 2 / MOTION 1.* Tenang, terstruktur, gerak seperlunya. Bukan landing page.

## 4. Rancangan yang diusulkan

### 4.1 Kepala halaman

Ganti header polos dengan ringkasan kerja: judul, lalu tiga angka yang benar-benar membantu keputusan (menunggu aksi Anda, sedang dikerjakan, revisi diminta). Angka berasal dari data yang sudah ada (`counts`). Tidak ada statistik karangan.

### 4.2 Kartu pesanan

Kerangka tiga bagian yang jelas, mengikuti `SellerOrderCard`:

1. **Kepala**: nomor pesanan (mono), status pill, dan badge aksi berikutnya.
2. **Isi**: kotak "langkah berikutnya" yang menjelaskan apa yang menunggu dan dari siapa, kebutuhan pembeli ringkas, dan metadata nilai.
3. **Kaki**: tenggat dengan penekanan urgensi, revisi terpakai, dan tombol Detail.

Badge aksi berikutnya adalah kunci: "Setujui requirements", "Kirim hasil", "Menunggu pembeli", atau "Selesai". Satu label yang menjawab pertanyaan utama.

### 4.3 Tenggat

Tiga tingkat, bukan dua: lewat tenggat (merah), kurang dari 24 jam (kuning), normal (abu). Ditampilkan sebagai chip dengan ikon jam, bukan teks kecil.

### 4.4 Detail berlapis

Saat dibuka, urutannya:

1. **Yang perlu Anda lakukan sekarang** (aksi: setujui atau form kirim hasil), di wadah dengan aksen.
2. **Kebutuhan pembeli**, sebagai kutipan pendek.
3. **Agreement**, dilipat (details) agar tidak memenuhi layar; ringkasan durasi dan revisi tetap terlihat.
4. **Riwayat hasil**, timeline kecil dengan ikon pembeda jenis (tautan/catatan/berkas) dan versi.

### 4.5 Form kirim hasil

Tetap tiga jenis, tetapi:

- Jenis hasil jadi segmented control yang ringkas, bukan radio bertumpuk.
- Input berubah sesuai jenis, dengan label dan bantuan yang jelas.
- Ringkasan hasil tetap wajib dan ditempatkan setelah input jenis.
- Tombol kirim jelas sebagai aksi utama satu-satunya di bagian itu.

### 4.6 Bahasa status

`marketplaceServiceWorkStateLabels` sudah ada. Tambahkan satu baris penjelas per status yang menjawab "apa artinya bagi seller", misalnya:

- `awaiting_requirements`: "Periksa kebutuhan pembeli, lalu setujui untuk mulai."
- `in_progress`: "Kerjakan sesuai agreement, lalu kirim hasil sebelum tenggat."
- `delivered`: "Menunggu pembeli meninjau hasil."
- `revision_requested`: "Pembeli meminta revisi. Kirim versi baru."
- `accepted`: "Selesai. Dana dilepas ke saldo toko."

## 5. Yang tidak boleh dilakukan

- Tidak menambah angka atau grafik yang tidak punya sumber data.
- Tidak mengubah jalur uang, RPC, atau aturan lifecycle; ini pekerjaan UI.
- Tidak menambah dependency baru; gunakan komponen shared yang ada (`EmptyState`, `ErrorState`, `CardSkeleton`, `StatusPill`, `CountUp`, `motion`).
- Tidak menghapus aksesibilitas yang sudah ada (tablist, aria, focus ring, reduced motion).
- Tidak menyentuh halaman lain selain yang diperlukan untuk konsistensi.

## 6. Kesimpulan

Halaman ini fungsional dan sudah punya fondasi yang benar, tetapi belum mengarahkan seller ke keputusan. Perbaikan utamanya: hierarki kartu yang menjawab "apa langkah berikutnya", penekanan uang dan tenggat, detail berlapis, dan penyelarasan bahasa visual dengan `seller.pesanan`. Semua bisa dikerjakan tanpa data baru, tanpa RPC baru, dan tanpa dependency baru.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-redesign-ui-jasa-pesanan-seller.md`.
