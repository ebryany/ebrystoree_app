# Riset: Redesain Navbar Ebrystore (Arah SaaS, Full-Layar)

Tanggal: 2026-10-05 · Status: **RISET SELESAI — MENUNGGU KEPUTUSAN OWNER**
Cakupan: **gaya visual saja** (layout, lebar, kepadatan, tipografi). Animasi/scroll behavior
tidak diubah dan tidak dibahas sebagai target.

Metode: pembacaan kode langsung (`site-header.tsx`, 409 baris), pengukuran nilai kelas
Tailwind di sumber, pembanding lebar wadah di halaman lain, dan pembacaan token desain
(`styles.css`). **Tidak memakai agent, tidak membuka browser.**

---

## 1. Struktur navbar saat ini (dari kode)

`src/components/site-header.tsx` — 409 baris, 3 area:

| Area | Baris | Isi |
|---|---|---|
| Header + lapisan jarak | 82-91 | `sticky top-0 z-40`, padding berubah saat scroll |
| Permukaan navbar | 95-102 | border, bg-card, `max-w-[1440px]` saat scroll |
| Baris 1 (utama) | 103-238 | Logo, pencarian, notifikasi/akun, tombol menu |
| Baris 2 (navigasi) | 239-267 | Produk Digital, Bantuan Tugas, Bantuan, Artikel |
| Sheet mobile | 268-409 | Menu samping (tidak diubah) |

---

## 2. Kenapa terlihat "tengah", bukan full-layar

Ada **dua lapis pembatas lebar** yang menumpuk:

| Lapis | Kelas | Lebar efektif di 1920px |
|---|---|---|
| Permukaan navbar (saat scroll) | `max-w-[1440px]` + `mx-auto` | 1440px, sisa 240px kiri-kanan |
| Isi baris 1 | `max-w-6xl` + `mx-auto` | **1152px**, sisa 384px kiri-kanan |
| Isi baris 2 (nav) | `max-w-6xl` + `mx-auto` | **1152px**, sisa 384px kiri-kanan |

**Temuan utama:** isi navbar dibatasi `max-w-6xl` = 1152px. Di layar 1920px, **40% lebar
layar kosong** (384px kiri + 384px kanan). Itu penyebab kesan "tengah".

Saat belum scroll, permukaan `max-w-none` (penuh), tapi isinya tetap 1152px. Jadi
permukaannya penuh, isinya tengah. Dua hal ini tidak sinkron.

---

## 3. Lebar wadah di halaman lain (pembanding)

| Berkas | `max-w` yang dipakai |
|---|---|
| `index.tsx` (home) | `max-w-6xl`, `max-w-4xl`, `max-w-2xl`, `max-w-xl` |
| `produk.index.tsx` | `max-w-6xl`, `max-w-xl` |
| `layanan.index.tsx` | `max-w-6xl`, `max-w-xl` |
| `site-footer.tsx` | `max-w-6xl`, `max-w-lg` |

**Semua halaman publik memakai `max-w-6xl` (1152px).** Jadi navbar saat ini **sudah sejajar**
dengan konten halaman. Mengubah navbar jadi full-layar akan membuatnya **tidak sejajar**
dengan konten di bawahnya, kecuali halaman lain juga ikut diubah.

---

## 4. Karakter visual saat ini (bukan SaaS)

| Aspek | Nilai sekarang | Karakter |
|---|---|---|
| Lebar | 1152px terpusat | portal/katalog |
| Latar | `bg-card` (putih murni) | datar |
| Border | `border-b border-border` | garis tipis |
| Radius (saat scroll) | `rounded-2xl` (16px) | mengambang |
| Radius (di puncak) | `rounded-none` | datar |
| Tinggi | 64px (puncak), 56px (scroll) | sedang |
| Navigasi | baris kedua terpisah dengan `border-t` | dua tingkat |
| Tipografi nav | `text-sm font-medium` | standar |
| Pencarian | di tengah baris 1, `max-w-md` saat sm | menonjol |

**Ciri "SaaS"** yang belum ada: lebar penuh, kepadatan tinggi, pemisah halus, aksen
tipis pada item aktif, dan pencarian sebagai elemen utama (bukan tengah-tengah).

---

## 5. Token yang tersedia (untuk gaya SaaS)

| Token | Nilai (mode terang) | Catatan |
|---|---|---|
| `--background` | `oklch(0.985 0.006 95)` | off-white, dasar halaman |
| `--card` | `oklch(1 0 0)` | putih murni |
| `--foreground` | `oklch(0.22 0.03 205)` | ink-teal gelap |
| `--primary` | `oklch(0.33 0.062 200)` | teal gelap, aksen utama |
| `--accent` | `oklch(0.52 0.098 195)` | teal lebih terang |
| `--border` | `oklch(0.9 0.012 195)` | garis halus |
| `--muted` | `oklch(0.95 0.009 190)` | latar lembut |
| `--surface` | `oklch(0.965 0.01 95)` | panel lembut |

Radius: `--radius-control: 0.5rem` (8px, tombol), `--radius-card: 0.5rem`,
`--radius-panel: 0.75rem`, `--radius-modal: 1rem`.

Shadow: `--shadow-card` (halus), `--shadow-lifted` (lebih tegas).

---

## 6. Yang harus dipertahankan (jangan diubah)

| Aspek | Alasan |
|---|---|
| Sheet mobile (baris 268-409) | Sudah berfungsi; permintaan Owner hanya gaya |
| Pencarian + fungsi submit | Fitur inti |
| Notifikasi, menu akun, tombol keluar | Fitur akun |
| `pt-safe` | Perbaikan safe area iOS, sudah diverifikasi |
| `useScrolled` + morph saat scroll | Sudah disetujui Owner ("oke sudah bagus") |
| Struktur dua baris (utama + navigasi) | Fungsi menu tidak boleh hilang |
| `NAV_META` (ikon + deskripsi) | Dipakai sheet mobile |
| Aksesibilitas | `aria-label`, `focus-visible`, target >= 44px |

---

## 7. Celah yang ditemukan

| # | Celah | Bukti | Dampak |
|---|---|---|---|
| N-1 | Isi navbar 1152px di layar lebar | `max-w-6xl` di baris 105 & 244 | Terkesan "tengah", bukan SaaS |
| N-2 | Permukaan dan isi tidak sinkron | permukaan `max-w-none`, isi `max-w-6xl` | Saat belum scroll, ada ruang mati di kiri-kanan isi |
| N-3 | Dua lapis pembatas lebar | `max-w-[1440px]` + `max-w-6xl` | Sulit diprediksi, redundan |
| N-4 | Navigasi baris 2 terpisah garis | `border-t border-border` (baris 241) | Terkesan dua blok, bukan satu navbar SaaS |
| N-5 | Pencarian tengah, bukan utama | `sm:flex-1` di baris 131 | Kurang menonjol untuk marketplace |
| N-6 | Belum ada penanda aktif yang jelas | `activeProps` hanya `bg-surface-selected` | Sulit tahu halaman aktif |
| N-7 | Tidak ada pemisah antar area | tidak ada `border-l`/divider | Semua elemen menyatu, kurang terstruktur |

---

## 8. Keputusan yang dibutuhkan Owner

| # | Pertanyaan | Opsi | Rekomendasi riset |
|---|---|---|---|
| V-01 | Lebar navbar | tetap 1152px / **full-layar dengan padding** / full-bleed tanpa padding | full-layar dengan padding proporsional |
| V-02 | Halaman lain ikut diubah? | tidak / ya (semua `max-w-6xl` jadi lebih lebar) | **tidak** untuk sekarang; navbar saja dulu |
| V-03 | Baris 2 tetap dipisah garis? | ya / **disatukan tanpa garis, jarak saja** | disatukan (lebih SaaS) |
| V-04 | Pencarian | tetap tengah / **lebih lebar (utama)** / dikecilkan | lebih lebar |
| V-05 | Radius saat scroll | tetap 16px / **lebih kecil (8-10px)** | lebih kecil (lebih SaaS, lebih tegas) |
| V-06 | Tinggi | tetap / **lebih rapat (56px / 48px)** | lebih rapat |
| V-07 | Pemisah area | tidak ada / **garis vertikal halus** | tambah pemisah halus |

**Catatan penting untuk V-01:** mengubah navbar jadi full-layar akan membuatnya **tidak
sejajar** dengan konten halaman (yang tetap 1152px). Ini disengaja untuk gaya SaaS (navbar
lebar, konten terpusat terbaca), tapi Owner harus tahu konsekuensinya.

---

## 9. Status bukti

| Klaim | Status | Sumber |
|---|---|---|
| Isi navbar 1152px (`max-w-6xl`) | `VERIFIED` | Baca `site-header.tsx:105,244` |
| Dua lapis pembatas lebar | `VERIFIED` | `max-w-[1440px]` di :99, `max-w-6xl` di :105 |
| Halaman lain 1152px | `VERIFIED` | Grep `max-w` di 4 berkas |
| Token warna & radius | `VERIFIED` | `styles.css:119-155` |
| Sheet mobile berfungsi | `VERIFIED` | Baca kode, tidak diubah |
| Tampilan visual nyata | `NOT_VERIFIED` | Tidak membuka browser (arahan Owner) |
| Dampak ke konversi | `NOT_MEASURED` | Belum ada data |
