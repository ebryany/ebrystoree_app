# Audit UI/UX Frontend Desktop Ebrystore

Tanggal: 2026-10-06 · Metode: pengukuran runtime (browser 1440/1920px) + inspeksi kode
Cakupan: 92 file route, 5 shell (publik, customer, seller, operator, admin)
Status: **AUDIT SAJA — tidak ada kode yang diubah**

---

## Ringkasan Eksekutif

Tidak ditemukan horizontal overflow di semua halaman yang diukur, dan tidak ada halaman
yang runtuh. Masalahnya bukan "rusak", melainkan **tidak konsisten**: empat shell memakai
empat geometri layout berbeda, satu shell memakai navigasi milik shell lain, dan satu
komponen navigasi yang sudah dibuat tidak pernah dipasang.

Dari 92 route, **3 temuan High** berdampak langsung ke pengguna, **6 Medium**, dan
**5 Low**. Tidak ada temuan Critical (tidak ada data hilang atau kontrol mati total).

| Severity | Jumlah | Dampak utama |
|---|---:|---|
| High | 3 | Seller tidak bisa menjangkau halamannya sendiri; dua sidebar bersaing |
| Medium | 6 | Geometri layout berbeda antar peran; hierarki heading rusak |
| Low | 5 | Skala tipografi, radius, dan feedback tidak seragam |

---

## Baseline: Pedoman yang Dipakai

Sumber: `DESIGN.md`, `docs/ui-ux/01-ebrystore-design-direction.md`,
`docs/ui-ux/ebrystore-page-inventory.md`, `docs/ui-ux/ebrystore-component-inventory.md`.

Poin yang relevan untuk audit ini:

| # | Aturan | Sumber |
|---|---|---|
| G1 | Satu design system untuk publik, customer, admin, operator; kepadatan berbeda | design-direction |
| G2 | Low elevation: border tipis + `bg-card`; shadow hanya untuk elemen mengambang | DESIGN.md |
| G3 | Maksimal 2-3 warna inti + 1 aksen; tanpa hue baru tanpa alasan semantik | DESIGN.md |
| G4 | Angka data selalu `tabular-nums`; uppercase tracking-wide hanya label kecil | DESIGN.md |
| G5 | Mobile 390px wajib tanpa horizontal overflow | DESIGN.md (Hard Gate) |
| G6 | Tiga state UI: loading, empty, error | DESIGN.md (R-27) |
| G7 | Navigasi per peran sudah ditetapkan (customer bottom-nav, admin drawer+topbar) | design-direction |

---

## Temuan High

### H-1 — Seller memakai sidebar customer, bukan sidebar seller

**Fakta terukur.** Di `/seller` pada 1440px, `nav[aria-label="Navigasi akun desktop"]`
terbawa dengan **9 item** (Dashboard, Pesanan, Produk Saya, PO Custom, Chat Produk,
Notifikasi, Profil Saya, Pengaturan, plus "Jualan → Toko Saya"). Isinya menu **customer**.

**Akar masalah.** `src/routes/_authenticated/seller.tsx` mengimpor dan merender
`DashboardSidebar` (komponen customer), bukan `SellerSidebar`.

```
seller.tsx:11  import { DashboardSidebar } from "@/components/ebry/dashboard-sidebar";
seller.tsx:93  <DashboardSidebar unread={unread} />
seller.tsx:132 <DashboardSidebar unread={unread} />
```

**Dampak pengguna.** Seller melihat menu yang bukan pekerjaannya (PO Custom, Chat Produk
customer). Sebaliknya, menu yang relevan (Keuangan, Performa, Pengaturan Toko) hanya
tersedia lewat tab mobile.

**Bukti tambahan.** `SellerSidebar` yang dibuat untuk ini **tidak pernah dipasang**:
`grep SellerSidebar src` → hanya definisi di `seller-sidebar.tsx`, nol pemakaian.
Yang dipakai hanya `SellerMobileTabs` (tampil < md).

---

### H-2 — `/seller/pengaturan` tidak bisa dijangkau dari desktop

**Fakta terukur.** Dari 21 tautan terlihat di `/seller` (1440px), tidak ada satu pun
yang mengarah ke `/seller/pengaturan`.

```
hasKeuangan:   true
hasPerforma:   true
hasPengaturan: false
```

**Akar masalah.** Sama dengan H-1: `SellerSidebar` (yang memuat tautan Pengaturan Toko)
tidak dirender. `SellerMobileTabs` hanya muncul di bawah breakpoint `md`.

**Dampak pengguna.** Seller di desktop **tidak punya jalan** ke halaman pengaturan toko.
Fitur ada, halaman ada, tautan tidak ada.

---

### H-3 — Dua sistem navigasi aktif bersamaan di halaman seller

**Fakta terukur.** `/seller` memuat **7 elemen `<nav>`**; dua di antaranya navigasi
aplikasi yang sama-sama terlihat:

| aria-label | item | lebar | isi |
|---|---:|---:|---|
| Navigasi utama | 4 | 373px | header publik |
| Navigasi akun desktop | 9 | 240px | **sidebar customer** |
| Navigasi toko | 5 | 0px (hidden di desktop) | bottom nav seller |

**Akar masalah.** Shell seller dibangun dengan menyalin shell customer lalu menambahkan
`SellerMobileTabs` di atasnya, tanpa mengganti sidebar desktop.

**Dampak pengguna.** Dua model mental bercampur: "akun saya" dan "toko saya" tampil
sebagai satu daftar. Ini juga melanggar G1 (satu design system, kepadatan berbeda per peran).

---

## Temuan Medium

### M-1 — Empat shell, empat geometri layout berbeda

Diukur pada 1920×1080 (viewport 1905px). Kolom `main` tiap shell:

| Shell | Kiri | Lebar | Catatan |
|---|---:|---:|---|
| Publik `/` | 0 | 1905 | konten di dalam container sendiri (h1 di x=505) |
| Publik `/produk` | 0 | 1905 | h1 di x=401 |
| Customer `/dashboard` | 549 | 1080 | `max-w-[1400px]` + `max-w-6xl` |
| Seller `/seller` | 549 | 1080 | sama dengan customer |
| Admin `/admin` | 361 | 1440 | `max-w-[1440px]` |
| Operator `/operator` | 144 | 1152 | `max-w-6xl` saja |

Pada 1440px, `main` admin = 1184px, customer = 1080px, operator = 1152px.

**Akar masalah.** Tidak ada satu token container. Nilai yang dipakai bersamaan:
`max-w-[1440px]` (5×), `max-w-[1400px]` (3×), `max-w-6xl` (30×), `max-w-5xl` (7×).

**Dampak.** Pindah antar peran terasa seperti pindah aplikasi. Padding kiri konten
bergeser 100-400px tanpa alasan fungsional.

---

### M-2 — H1 publik tidak sejajar dengan konten di bawahnya

**Fakta terukur (1440px).**

| Halaman | posisi kiri H1 | lebar |
|---|---:|---:|
| `/` | 265 | 896 |
| `/produk` | 161 | 543 |
| `/layanan` | 161 | 576 |
| `/artikel` | 153 | 768 |

Selisih hingga **112px** antar halaman publik. Penyebabnya tiap halaman mendefinisikan
container sendiri-sendiri, bukan memakai satu `PageHeader`.

**Dampak.** Saat berpindah menu di header publik, judul "meloncat" horizontal. Terlihat
seperti bug rendering, bukan keputusan desain.

---

### M-3 — Hierarki heading rusak di 9 file route

| File | H1 | H2 | H3 |
|---|---:|---:|---:|
| `seller.keuangan.tsx` | **3** | 1 | 0 |
| `auth.tsx` | **3** | 0 | 0 |
| `seller.tsx` | **3** | 0 | 0 |
| `layanan.$slug.tsx` | 2 | 6 | 0 |
| `produk.$slug.tsx` | 2 | 2 | 3 |
| `artikel.index.tsx` | 2 | 2 | 1 |
| `toko.$slug.tsx` | 2 | 2 | 0 |
| `artikel.$slug.tsx` | 2 | 1 | 0 |

**Akar masalah.** H1 dipakai sebagai "judul visual" di beberapa state sekaligus
(mis. `seller.keuangan.tsx` punya H1 di state loading, error, dan sukses).

**Dampak.** Screen reader mengumumkan beberapa judul utama; struktur dokumen tidak bisa
dipakai untuk navigasi. Melanggar praktik aksesibilitas standar.

---

### M-4 — Ukuran H1 tidak konsisten (9 ukuran berbeda)

Distribusi `text-*` pada `<h1>` di seluruh route:

```
text-xl (20) · text-2xl (17) · text-3xl (9) · text-lg (8)
text-5xl (2) · text-4xl (2) · text-6xl (1) · text-sm (1)
```

Kombinasi terburuk: `seller.tsx` memakai `text-sm` untuk H1 di satu tempat dan `text-lg`
di tempat lain pada file yang sama.

**Dampak.** Judul halaman tidak punya bobot yang bisa diprediksi. Di halaman data
(admin/seller) H1 kadang lebih kecil dari isi tabel.

---

### M-5 — Fragmentasi komponen state dan header

| Komponen | Dipakai di |
|---|---:|
| `AdminLoading` | 48 file |
| `StatusPill` | 22 file |
| `EmptyRow` | 21 file |
| `StatusBadge` | 11 file |
| `CardSkeleton` | 8 file |
| `InlineEmpty` | 6 file |
| `PageHeader` | 4 file |
| `AdminPageHeader` | 1 file |

Dua komponen status bersaudara (`StatusPill` dan `StatusBadge`) hidup berdampingan
dengan API berbeda. Tiga komponen loading (`AdminLoading`, `CardSkeleton`, `Skeleton`)
dan dua komponen empty (`EmptyRow`, `InlineEmpty`) dipakai bergantian tanpa aturan.

**Dampak.** Status yang sama (mis. "menunggu pembayaran") bisa tampil dengan bentuk
berbeda di halaman berbeda. Biaya perawatan naik setiap kali ada perubahan label.

---

### M-6 — Padding kartu tidak seragam dalam satu halaman

Diukur dari elemen `.bg-card` pada 1440px:

| Halaman | Nilai padding yang ditemukan |
|---|---|
| `/admin` | `0px`, `8px 16px`, `20px` |
| `/admin/orders` | `0px`, `10px 12px`, `16px`, `14px 16px` |
| `/admin/seller/laporan` | `0px`, `8px 16px` |
| `/admin/seller` | `0px` |

`0px` muncul karena header kartu memakai padding sendiri, tetapi tidak ada pola tetap:
empat varian padding berbeda muncul di satu halaman.

**Dampak.** Ritme vertikal halaman data tidak rata; tepi kiri konten tidak membentuk garis.

---

## Temuan Low

### L-1 — Skala tipografi terlalu lebar

Terdapat **9 ukuran teks arbitrer** di luar skala Tailwind: `text-[8px]`, `text-[10px]`,
`text-[11px]`, `text-[17px]`. Total pemakaian `text-[11px]` = 107 kali, `text-[10px]` = 27.

`text-[8px]` dan `text-[10px]` berada di bawah ambang keterbacaan nyaman dan berisiko
gagal kontras saat diperbesar.

### L-2 — Radius tidak mengikuti token

Token tersedia: `--radius-card: 0.5rem`, `--radius-panel: 0.75rem` (dipakai hanya 5×).
Pemakaian aktual: `rounded-xl` 202×, `rounded-full` 155×, `rounded-lg` 134×,
`rounded-2xl` 133×, `rounded-md` 80×, `rounded-3xl` 8×.

Lima nilai radius beredar padahal hanya dua yang didefinisikan. `rounded-full` 155×
berisiko melanggar aturan "jangan semua pill" (R-11).

### L-3 — Shadow bercampur token dan utilitas

`shadow-card` 32× dan `shadow-lifted` 10× (token) berdampingan dengan `shadow-sm` 31×,
`shadow-lg` 9×, `shadow-md` 8×, `shadow-xl` 2× (utilitas). DESIGN.md menetapkan
low elevation; `shadow-lg`/`shadow-xl` perlu ditinjau per kasus.

### L-4 — 23 ikon tanpa `aria-hidden` atau label

Dari 394 ikon ber-`className` `size-*`, 23 tidak punya `aria-hidden` maupun `aria-label`.
Terbanyak: `admin/nav-editor.tsx` (4), lalu beberapa halaman dengan 2 masing-masing
(`index.tsx`, `checkout.produk.$slug.tsx`, `dashboard.notifikasi.tsx`, `admin/jobs.tsx`,
`admin/seller.$id.tsx`, `admin/settings.website.tsx`).

### L-5 — Feedback error tidak konsisten

34 file memakai `toast.error`, 53 file memakai inline error (`AdminError`/`ErrorState`).
Tidak ada aturan kapan memakai yang mana. Untuk kegagalan muat data, toast menghilang
sehingga pengguna kehilangan konteks; untuk kegagalan aksi, inline error tidak terlihat
jika berada di luar viewport.

---

## Yang Sudah Baik (jangan diubah tanpa alasan)

| Aspek | Bukti |
|---|---|
| Tidak ada horizontal overflow | 0px di semua halaman diukur (1440 & 1920) |
| Target sentuh mobile | 0 elemen <44px di 6 halaman seller |
| State lengkap di halaman data | 79 dari 92 route punya loading + error + empty |
| Token warna dipatuhi | Tidak ada hex hardcoded di route/komponen |
| Kontras & focus ring | `focus-visible:ring-2` konsisten di kontrol utama |
| Angka tabular | `tabular-nums` dipakai di metrik dan nominal |

---

## Akar Masalah (bukan gejala)

1. **Tidak ada shell layout bersama.** Setiap peran menulis ulang header, sidebar, dan
   container sendiri. Ini penyebab M-1, M-2, dan H-3.
2. **Tidak ada kontrak navigasi per peran.** `seller.tsx` menyalin customer lalu
   menambahkan tab mobile, sehingga sidebar desktop tertinggal. Ini penyebab H-1 dan H-2.
3. **Tidak ada aturan "satu H1 per halaman".** H1 dipakai sebagai judul state.
   Ini penyebab M-3 dan M-4.
4. **Token ada tetapi tidak diadopsi.** Radius dan shadow punya token, tetapi mayoritas
   kode memakai utilitas langsung. Ini penyebab L-2 dan L-3.
5. **Komponen status/empty ganda** dibuat pada waktu berbeda tanpa konsolidasi.
   Ini penyebab M-5 dan L-5.

---

## Prioritas Perbaikan

| Prioritas | Item | Alasan urutan |
|---|---|---|
| **P0** | H-1, H-2, H-3 | Seller kehilangan akses ke fiturnya sendiri. Perbaikan kecil (tukar komponen) dengan dampak besar. |
| **P1** | M-1, M-2 | Menyentuh semua peran; sebaiknya diselesaikan sebelum menambah halaman baru. |
| **P1** | M-3, M-4 | Aksesibilitas + konsistensi judul; murah diperbaiki dengan satu komponen `PageHeader`. |
| **P2** | M-5, M-6 | Konsolidasi komponen; butuh keputusan desain, bukan sekadar penggantian. |
| **P3** | L-1 s.d. L-5 | Pembersihan sistematis; bisa bertahap per area. |

---

## Rekomendasi Bentuk Perbaikan (belum dikerjakan)

1. **Satu `AppShell`** dengan prop `variant: "public" | "customer" | "seller" | "operator" | "admin"`
   yang mengatur container, sidebar, dan padding. Menghapus tiga definisi container.
2. **Ganti `DashboardSidebar` → `SellerSidebar`** di `seller.tsx` (dua baris), lalu hapus
   `SellerMobileTabs` dari alur desktop agar tidak dobel.
3. **Satu `PageHeader`** yang dipakai semua halaman, dengan ukuran H1 tunggal
   (`text-2xl` desktop, `text-xl` mobile) dan slot breadcrumb + aksi.
4. **Aturan H1**: hanya satu per halaman, dirender di luar blok loading/error.
   State loading/error memakai `role="status"` / `role="alert"`, bukan H1.
5. **Adopsi token**: ganti `rounded-xl/2xl` → `rounded-[var(--radius-card)]`,
   `rounded-lg` → `rounded-[var(--radius-panel)]`, dan batasi `shadow-lg/xl`.
6. **Konsolidasi status**: pilih satu dari `StatusPill`/`StatusBadge`, satu dari
   `EmptyRow`/`InlineEmpty`, satu pola loading.

---

## Batasan Audit

- Diukur pada Chromium (viewport 1280, 1440, 1920). Safari/Firefox belum diuji.
- Halaman yang butuh data spesifik (mis. detail order dengan ID valid) diukur pada
  state kosong/daftar, bukan state berisi penuh.
- Audit ini tidak menilai kualitas copy atau estetika; fokus pada konsistensi
  layout, hierarki, dan penggunaan komponen.
- Tidak ada redesign atau perubahan kode yang dilakukan.
