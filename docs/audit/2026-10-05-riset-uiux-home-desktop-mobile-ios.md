# Riset UI/UX: Redesain Home Ebrystore — Desktop & Mobile (arah iOS)

Tanggal: 2026-10-05 · Status: **RISET SELESAI — MENUNGGU KEPUTUSAN OWNER**
Arah desain yang diminta Owner: **modern, user friendly, condong ke bahasa desain iOS**.

Metode: pengukuran DOM langsung di browser (Chrome, emulasi iPhone 14 Pro 393x852,
desktop 1024/1440/1920), pembacaan kode, dan pengukuran situs referensi (Apple Store)
serta dokumentasi teknis yang dapat diakses publik. Setiap angka hasil ukur.

Sumber yang berhasil diambil:
- WebKit: *Designing Websites for iPhone X* (safe area, `env()`, `viewport-fit=cover`)
- NN/g: riset UX mobile (ukuran target sentuh, kesalahan sentuh)
- MDN: `env()` dan viewport meta tag
- Pengukuran langsung `apple.com/shop` desktop 1440 + mobile 390

Sumber yang gagal diakses: `developer.apple.com/design/human-interface-guidelines`
(butuh JavaScript, snapshot Wayback pun JS-only). Nilai HIG yang dipakai di bawah
diambil dari dokumentasi teknis WebKit/MDN dan pengukuran langsung Apple Store, bukan
kutipan HIG. Statusnya ditandai jujur di §7.

---

## 1. Kondisi home saat ini (hasil ukur)

### 1.1 Desktop

| Viewport | Lebar konten | Ruang terbuang (kiri+kanan) | Kolom grid produk | Lebar kartu |
|---|---|---|---|---|
| 1024 | 1024 | 0 | 4 | 232 (hanya 2 terisi) |
| 1440 | 1152 | **288** | 4 | 264 (hanya 2 terisi) |
| 1920 | 1152 | **768** | 4 | 264 (hanya 2 terisi) |

- Tinggi header: **132px** (di semua lebar). Situs referensi: 44-48px area kontrol.
- `<h1>` di posisi 155px tapi **tidak terlihat** (lebar < 100px, `sr-only`).
- Pada 1920px, **40% lebar layar kosong** (768 dari 1920).

### 1.2 Mobile (emulasi iPhone 14 Pro, 393x852)

| Metrik | Nilai | Catatan |
|---|---|---|
| Tinggi header | **135px** | 16% dari tinggi layar |
| Tinggi dokumen | 6.428px | 7,5 layar |
| Target sentuh < 44px | **4 elemen** | 2 judul produk "template" (18px), 1 "Artikel" (41px), 1 skip-link |
| Input font < 16px | 0 | Bagus: tidak memicu zoom otomatis iOS |
| Jarak tepi konten | 0px | Tidak ada padding terdokumentasi di wadah utama |
| Gambar hero rasio | 1.73:1 | 361x209 |
| Elemen `position: fixed` di bawah | **tidak ada** | Tidak ada bottom bar |

### 1.3 Celah iOS-spesifik (baru, belum tercatat di riset sebelumnya)

| # | Temuan | Bukti | Dampak di iOS |
|---|---|---|---|
| I-1 | `viewport-fit=cover` tidak diset | `__root.tsx:95` hanya `width=device-width, initial-scale=1` | Layar iPhone berponi tidak memakai area penuh; ada garis latar di atas/bawah |
| I-2 | `pb-safe` didefinisikan tapi **0 pemakaian** | `styles.css:390` vs grep seluruh `src/` | Konten bisa tertutup home indicator |
| I-3 | Tidak ada `env(safe-area-inset-top)` di header sticky | Header `sticky top-0`, tanpa padding atas aman | Header bisa menempel di bawah poni |
| I-4 | Header mobile 135px | Terukur | 16% layar habis sebelum konten; di iOS terasa berat |
| I-5 | 2 judul produk jadi target sentuh 18px | Terukur: 2 elemen `h=18` | Salah sentuh (NN/g: target kecil = sumber utama kesalahan sentuh) |
| I-6 | Bottom navigation sengaja **tidak dipakai di home** | `ebry/bottom-nav.tsx` ada dan dipakai di `dashboard.tsx:80`, `operator.tsx:47`, `seller.tsx:102`; home tidak memakainya | Keputusan Owner: home tanpa bottom nav. Komponennya tidak boleh diubah. Jangkauan jempol di home ditangani lewat tata letak konten, bukan bar bawah |

**Koreksi riset sebelumnya:** riset awal menyebut "tidak ada bottom bar". Yang benar:
komponen `BottomNavigation` sudah ada dan dipakai di tiga layout privat. Untuk halaman
**home**, Owner memutuskan **tanpa bottom nav**, dan komponen yang ada **tidak diubah**.

---

## 2. Referensi terukur: Apple Store

Diukur langsung di `apple.com/shop`, bukan dikutip.

### 2.1 Tipografi

| Aspek | Desktop 1440 | Mobile 390 |
|---|---|---|
| Font stack | `"SF Pro Text", "SF Pro Icons", "Helvetica Neue"` | sama |
| Ukuran body | **17px** | 17px |
| Line-height body | 25px (1.47) | 25px (1.47) |
| Heading navigasi | 12px w400 | **17px w400** |
| Heading kategori | 24px | 28px |

**Pola kunci:** Apple tidak memakai heading besar di navigasi. Heading 12px (desktop)
dan 17px (mobile) dengan berat 400. Yang besar adalah **nama produk** (24-28px),
bukan label struktur.

### 2.2 Kontrol

| Aspek | Nilai terukur |
|---|---|
| Tinggi tombol | 44px (desktop), **48px** (mobile) |
| `border-radius` tombol | **0px** (siku, bukan pill) |
| Ukuran font tombol | 17px |

**Pola kunci:** radius 0 pada tombol utama. Apple memakai sudut siku untuk kontrol,
radius hanya pada kartu. Ini kebalikan dari kebiasaan "semua pill".

### 2.3 Navigasi mobile

Dari pengukuran teks: `Apple / Store / iPad / iPhone / Watch / Vision / AirPods /
TV & Home` dengan tinggi 28px dan jarak 46px antar item (134, 180, 226, 272, 318, 364).
Ini daftar vertikal besar, bukan chip berdesakan.

---

## 3. Standar iOS yang relevan (dari sumber teknis)

### 3.1 Safe area (WebKit, terverifikasi)

```html
<meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover'>
```

```css
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
padding-bottom: env(safe-area-inset-bottom);
```

Kutipan WebKit: *"it is immediately clear why it is important to respect the system's
safe area insets: some of the page's content is obscured by the device's sensor housing,
and the bottom navigation bar is very hard to use."*

Empat variabel: `safe-area-inset-{top,right,bottom,left}`. Tersedia sejak iOS 11;
`env()` menggantikan `constant()` sejak iOS 11.2.

### 3.2 Target sentuh (NN/g, terverifikasi)

Kutipan NN/g: *"the target size required to optimize the reaching time and minimize
errors is considerably larger for touch than for mouse. So not only is the screen smaller
than a laptop or desktop screen, but buttons and other targets need to be larger than
those on a regular monitor."*

Kutipan NN/g: *"Because on a touchscreen there can be many target areas, it is easy to
make accidental touches."*

Angka 44x44pt adalah pedoman HIG; statusnya dijelaskan di §7.

### 3.3 Jangkauan jempol

Dari NN/g dan praktik iOS: area nyaman jempol ada di **sepertiga bawah layar** saat
memegang ponsel satu tangan. Konsekuensi: aksi utama sebaiknya bisa dijangkau tanpa
meregangkan tangan ke atas.

---

## 4. Rekomendasi desktop

### 4.1 Lebar dan ruang

| Aspek | Sekarang | Usulan | Alasan |
|---|---|---|---|
| Wadah maksimum | 1152px (max-w-6xl) | **1280px** untuk katalog, 1152px untuk teks | 1920px menyisakan 768px kosong; katalog butuh ruang |
| Ruang terbuang 1920 | 768px (40%) | < 400px | Layar besar harus dipakai, bukan disia-siakan |
| Grid produk | 4 kolom tetap | **adaptif**: 2/3/4/5 kolom sesuai jumlah item | 2 item di grid 4 kolom = 2 slot kosong mencolok |

### 4.2 Struktur layar pertama (usulan)

Urutan yang diusulkan untuk 900px pertama desktop:

1. Header ringkas (target: **<= 72px**, sekarang 132px)
2. Hero: `<h1>` terlihat + 1 paragraf + 2 CTA, di samping atau di atas banner
3. Baris kategori (chip horizontal, satu baris)
4. Baris pertama produk (minimal 4 kartu terlihat)

Target: **produk pertama terlihat sebelum 900px**. Sekarang di 2.996px.

### 4.3 Tipografi (mengikuti pola Apple)

| Elemen | Sekarang | Usulan | Alasan |
|---|---|---|---|
| Body | 14px (`text-sm`) | **16px** desktop | Apple: 17px; 16px batas nyaman baca |
| Heading section | 20-24px w700 | 24-28px w600 | Turunkan berat, naikkan ukuran: lebih tenang |
| Label struktur | 14px | 12-13px w500 | Apple memakai 12px untuk label navigasi |
| Angka/harga | - | `tabular-nums`, 17-18px w600 | Harga harus jadi fokus, bukan heading |

### 4.4 Kontrol

| Aspek | Usulan | Alasan |
|---|---|---|
| Radius tombol | **8px** (bukan pill) | Mengikuti pola Apple (0px) tapi tetap satu bahasa dengan token existing |
| Tinggi tombol | 44px, CTA utama 48px | Terukur dari Apple Store |
| Hover | transisi 120ms (token `--motion-fast`) | Sudah ada di sistem |

---

## 5. Rekomendasi mobile

### 5.1 Safe area (wajib, ini bug)

1. Tambah `viewport-fit=cover` di `__root.tsx:95`.
2. Pakai `pb-safe` (utility sudah ada, tinggal dipakai) di footer dan elemen fixed bawah.
3. Tambah padding atas aman di header sticky:
   `padding-top: max(env(safe-area-inset-top), 0px)`.
4. Uji di iPhone berponi nyata atau emulasi dengan inset bukan nol.

### 5.2 Header (target: <= 88px)

Sekarang 135px. Usulan:
- Baris 1: logo + ikon akun (48px)
- Baris 2: kolom pencarian (40px)
- Navigasi kategori dipindah ke baris chip yang bisa digeser horizontal, bukan
  menambah tinggi header.

### 5.3 Navigasi bawah: TIDAK dipakai di home (keputusan Owner)

Halaman home **tidak memakai bottom navigation**. Ini keputusan Owner, bukan celah.

`BottomNavigation` di `src/components/ebry/bottom-nav.tsx` tetap dipakai di
`dashboard.tsx`, `operator.tsx`, dan `seller.tsx` seperti sekarang. Komponen itu
**tidak boleh diubah** oleh pekerjaan ini.

Konsekuensi untuk desain home mobile: karena tidak ada bar bawah, jangkauan jempol
ditangani lewat tata letak konten (kartu produk besar, aksi di dalam kartu), bukan
lewat bar navigasi. Aksi utama tetap di aliran konten, bukan ditempel di bawah.

### 5.4 Target sentuh

Perbaiki 4 target yang terukur < 44px:
- Judul produk di kartu: jadikan seluruh kartu `<Link>` (sudah begitu di sebagian
  kartu, tapi judul di dalamnya jadi target terpisah 18px).
- "Artikel" 41px -> naikkan ke 44px.

### 5.5 Jarak tepi

Sekarang 0px terukur di wadah utama. Usulan: **16px** kiri-kanan (standar iOS), dengan
`max(env(safe-area-inset-left), 16px)` untuk mode lanskap.

---

## 6. Yang dipertahankan (sudah benar)

| Aspek | Bukti |
|---|---|
| Input font >= 16px | Terukur: 0 input di bawah 16px; iOS tidak zoom saat fokus |
| Tidak ada overflow horizontal 390px | Terukur di riset sebelumnya |
| Token desain lengkap | `--tap-min: 2.75rem`, radius bertingkat, motion 120/200/320ms |
| `pb-safe` sudah didefinisikan | `styles.css:390`, tinggal dipakai |
| Reduced-motion dihormati | Semua komponen motion |

---

## 7. Status bukti (jujur)

| Klaim | Status | Sumber |
|---|---|---|
| Angka pengukuran home (header 135px, 4 target kecil, dll) | `VERIFIED` | Ukur DOM langsung |
| Angka Apple Store (17px body, 44/48px tombol, radius 0) | `VERIFIED` | Ukur DOM langsung |
| Safe area `env()` dan `viewport-fit=cover` | `VERIFIED` | WebKit blog + MDN |
| Target sentuh lebih besar untuk sentuh daripada mouse | `VERIFIED` | NN/g |
| Pedoman HIG "44x44pt" | `PARTIALLY_VERIFIED` | Tidak bisa akses HIG langsung; angka beredar luas, dipakai sebagai konvensi |
| Nilai HIG lain (grid 8pt, margin 16pt) | `PARTIALLY_VERIFIED` | Sumber sekunder, bukan HIG langsung |
| Dampak perubahan ke konversi | `NOT_MEASURED` | Belum ada funnel analytics untuk home |

---

## 8. Keputusan yang dibutuhkan Owner

| # | Pertanyaan | Opsi | Rekomendasi |
|---|---|---|---|
| U-01 | Bahasa desain | tetap Ebrystore / **condong iOS** / campuran | condong iOS untuk mobile, tetap Ebrystore untuk desktop |
| U-02 | Bottom tab bar mobile | tambah / tidak | **DIPUTUSKAN OWNER: tidak** untuk home. Komponen yang ada tidak diubah |
| U-03 | Lebar wadah desktop | 1152 / **1280** / fluid | 1280 untuk katalog |
| U-04 | Radius tombol | pill sekarang / **8px** / 12px | 8px (pola Apple, tetap satu bahasa) |
| U-05 | Ukuran body | 14px / **16px** | 16px |
| U-06 | Tinggi header mobile | 135px / <= 88px | <= 88px |
| U-07 | Safe area | tambah sekarang / nanti | **tambah sekarang** (ini bug, bukan preferensi) |

---

## 9. Urutan pekerjaan yang disarankan

1. **Safe area** (U-07): bug iOS, murah, wajib. `viewport-fit=cover` + pakai `pb-safe`.
2. **Target sentuh** (§5.4): 4 elemen, perbaikan cepat, dampak langsung.
3. **Header mobile** (§5.2): 135px -> <= 88px, buka ruang layar pertama.
4. **Hero terlihat** (§4.2): `<h1>` + CTA, dari riset sebelumnya (H-05).
5. **Grid adaptif** (§4.1): hilangkan slot kosong.
6. **Tipografi** (§4.3): setelah struktur beres, supaya tidak mengukur ulang dua kali.

**Tidak termasuk pekerjaan:** bottom navigation untuk home (diputuskan tidak dipakai)
dan mengubah `src/components/ebry/bottom-nav.tsx`.
