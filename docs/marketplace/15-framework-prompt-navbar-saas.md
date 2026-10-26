# 15 — Framework Prompt MGRCAO V3: Redesain Navbar Gaya SaaS (Full-Layar) — Tim 6 Role

Tanggal: 2026-10-05 · Basis riset: [`../audit/2026-10-05-riset-navbar-saas.md`](../audit/2026-10-05-riset-navbar-saas.md)
Status: **SIAP DIPAKAI — MENUNGGU KEPUTUSAN OWNER (V-01..V-07)**

---

## Cara memakai dokumen ini

Paket prompt berlapis untuk pekerjaan **gaya visual navbar**. Setiap tahap dikerjakan satu
role, dengan keluaran yang bisa diperiksa sebelum lanjut.

Alur: **Fase 0 (keputusan) → Fase 1 (lebar & struktur) → Fase 2 (kepadatan & tipografi)
→ Fase 3 (pemisah & status aktif) → Fase 4 (verifikasi)**.

Kontrak **MGRCAO V3** (M/G/R/C/A/O) dipakai di setiap prompt.

**Batasan tegas dari Owner:** yang diubah **hanya gaya**. Animasi, transisi, dan perilaku
scroll **tidak disentuh**. Jangan menjalankan agent, jangan membuka browser.

---

## Aturan Non-Negosiasi (berlaku di SEMUA prompt)

1. **Hanya gaya.** Jangan ubah animasi, durasi transisi, atau perilaku scroll. Morph
   navbar saat scroll sudah disetujui Owner dan **tidak boleh diubah**.
2. **Jangan hapus fungsi.** Pencarian, notifikasi, menu akun, tombol keluar, Sheet mobile,
   dan struktur dua baris tetap ada. Menu tidak boleh hilang.
3. **Jangan sentuh Sheet mobile** (baris 268-409 `site-header.tsx`). Sudah berfungsi.
4. **Pertahankan `pt-safe`** (perbaikan safe area iOS, sudah diverifikasi).
5. **Evidence-before-claim.** Setiap klaim menyebut file:baris. Status: `VERIFIED` /
   `PARTIALLY_VERIFIED` / `NOT_IMPLEMENTED` / `OWNER_DECISION_REQUIRED`.
6. **Tidak ada agent, tidak ada browser.** Verifikasi lewat pembacaan kode dan ukuran
   nilai kelas di sumber, bukan menjalankan halaman.
7. **Aksesibilitas dijaga.** `aria-label`, `focus-visible`, target sentuh >= 44px.
8. **Token desain saja.** Warna/radius/shadow dari `styles.css`. Tidak ada warna baru.
9. **Anti AI-slop.** Tanpa glow, gradien dekoratif, emoji, atau bayangan bertumpuk.

---

## FASE 0 — Keputusan Owner (WAJIB SEBELUM KODE)

**Role:** Product strategist + Engineering lead

**M — Mindset.** Tujuh keputusan menentukan bentuk navbar. Yang paling berat: lebar.
Mengubah navbar jadi full-layar akan membuatnya tidak sejajar dengan konten (1152px).

**G — Goal.** Jawaban tegas atas V-01..V-07, tercatat di `docs/marketplace/02-decision-register.md`.

**R — Riset/Basis.** Riset §2: isi navbar `max-w-6xl` = 1152px, sehingga di 1920px ada
**40% layar kosong**. §8 daftar keputusan.

**C — Context.** Halaman lain semua `max-w-6xl` (riset §3). Navbar saat ini **sudah sejajar**
dengan konten. Mengubah navbar saja akan memutus kesejajaran itu.

**A — Action.** Ajukan tujuh pertanyaan ini:

| # | Pertanyaan | Opsi | Rekomendasi riset |
|---|---|---|---|
| V-01 | Lebar navbar | tetap 1152 / **full-layar + padding** / full-bleed | full-layar + padding |
| V-02 | Halaman lain ikut diubah? | tidak / ya | **tidak** (navbar saja dulu) |
| V-03 | Baris 2 tetap dipisah garis? | ya / **disatukan** | disatukan |
| V-04 | Pencarian | tetap / **lebih lebar** / kecil | lebih lebar |
| V-05 | Radius saat scroll | 16px / **8-10px** | 8-10px |
| V-06 | Tinggi | tetap / **lebih rapat** | lebih rapat |
| V-07 | Pemisah area | tidak / **garis halus** | tambah |

**O — Output.** Tujuh baris keputusan di register.
**Gerbang G0:** tanpa jawaban, Fase 1 tidak dimulai.

---

## FASE 1 — Lebar & Struktur (inti gaya SaaS)

> Alasan urutan: lebar adalah akar kesan "tengah". Selama isi dikunci 1152px, perubahan
> lain (warna, radius) tidak akan mengubah karakternya.

### Prompt 1.1 — Layout Width Engineer

**Role:** Senior frontend engineer (layout).

**M — Mindset.** Navbar SaaS memakai lebar layar penuh dengan padding proporsional, bukan
wadah terpusat. Konten halaman tetap terpusat karena itu baik untuk keterbacaan; navbar
lebar karena itu area navigasi dan pencarian.

**G — Goal.** Navbar memakai lebar penuh sesuai V-01, tanpa memutus fungsi.

| Aspek | Target |
|---|---|
| Masalah | Isi navbar `max-w-6xl` (1152px); di 1920px sisa 384px kiri + 384px kanan = 40% kosong (riset §2) |
| Target | (a) isi navbar tidak lagi dikunci 1152px; (b) padding proporsional di kiri-kanan; (c) baris 1 dan baris 2 memakai lebar yang sama; (d) Sheet mobile tidak berubah |
| Acceptance | 1) tidak ada lagi `max-w-6xl` di baris 105 dan 244; 2) padding kiri = padding kanan; 3) tidak ada overflow horizontal; 4) fungsi pencarian/akun tetap; 5) Sheet tidak tersentuh |

**R — Riset/Basis.** §2 tabel lapis pembatas; §7 N-1, N-2, N-3.

**C — Context.** `site-header.tsx` baris 105 (baris 1) dan 244 (baris 2) memakai
`max-w-6xl mx-auto`. Permukaan navbar (baris 99) memakai `max-w-[1440px]` saat scroll.
Dua lapis ini redundan.

**A — Action.**
1. Tentukan satu strategi lebar. Rekomendasi: permukaan penuh (`max-w-none`) di semua
   state, isi memakai padding (`px-6 lg:px-8`) tanpa `max-w-6xl`.
2. Hapus `max-w-6xl` dari baris 105 dan 244. Jangan lupa `mx-auto` ikut dihapus jika
   tidak lagi diperlukan.
3. Pastikan baris 1 dan baris 2 memakai padding yang sama supaya tepinya lurus.
4. Jangan ubah `pt-safe`, `sticky`, `z-40`, atau logika `scrolled`.
5. Periksa: apakah `max-w-[1440px]` di baris 99 masih perlu? Bila permukaan sudah penuh,
   nilai itu tidak berpengaruh; putuskan dan catat alasannya.

**O — Output.** `site-header.tsx` bagian lebar saja.
**Bukti wajib:** daftar `max-w` sebelum/sesudah (grep), catatan baris yang diubah.

**Gerbang G1:** tidak ada `max-w-6xl` di navbar; padding kiri = kanan.

---

## FASE 2 — Kepadatan & Tipografi

> Alasan: navbar SaaS rapat dan tegas. Tinggi berlebih membuatnya terasa seperti portal.

### Prompt 2.1 — Density & Typography Engineer

**Role:** Frontend engineer (design system).

**M — Mindset.** Kepadatan adalah bahasa: navbar SaaS memuat lebih banyak aksi per piksel.
Tapi kepadatan tidak boleh mengorbankan target sentuh 44px.

**G — Goal.** Navbar lebih rapat sesuai V-06, pencarian lebih menonjol sesuai V-04.

| Aspek | Target |
|---|---|
| Masalah | Tinggi 64px (puncak) / 56px (scroll); pencarian `sm:max-w-md` dan `lg:flex-1` |
| Target | (a) tinggi sesuai V-06; (b) pencarian lebih lebar/menonjol; (c) target sentuh tetap >= 44px; (d) tipografi konsisten |
| Acceptance | 1) tinggi terukur di kode sesuai keputusan; 2) semua tombol >= `min-h-11`; 3) pencarian memakai ruang lebih; 4) tidak ada teks terpotong |

**R — Riset/Basis.** §4 tabel karakter visual; §7 N-5.

**C — Context.** Baris 106: `min-h-16` (puncak) / `min-h-14` (scroll). Pencarian baris 131:
`sm:max-w-md sm:flex-none lg:flex-1`. Tombol semua `min-h-11`.

**A — Action.**
1. Sesuaikan tinggi sesuai V-06. Jangan di bawah 44px untuk elemen yang bisa diklik.
2. Beri pencarian ruang lebih besar (mis. `max-w-md` -> `max-w-lg`, atau `flex-1` di
   lebih banyak breakpoint). Pencarian adalah aksi utama marketplace.
3. Periksa tipografi: nav `text-sm font-medium` sudah sesuai; jangan naikkan ke `font-bold`
   (terlalu berat untuk navbar).
4. Jangan ubah `transition-*` apa pun.

**O — Output.** `site-header.tsx` bagian tinggi & pencarian.
**Bukti wajib:** nilai `min-h-*` dan `max-w-*` pencarian sebelum/sesudah.

**Gerbang G2:** tinggi sesuai keputusan; target sentuh >= 44px; pencarian lebih lega.

---

## FASE 3 — Pemisah & Status Aktif

> Alasan: dua hal ini yang membuat navbar terasa "terstruktur" alih-alih sekadar deretan
> elemen. Keduanya murni gaya, tanpa mengubah fungsi.

### Prompt 3.1 — Divider & Active State Engineer

**Role:** Frontend engineer (UI detail).

**M — Mindset.** Navbar SaaS terasa rapi karena pemisahnya jelas: mana identitas, mana
navigasi, mana aksi. Status aktif harus terbaca tanpa menebak.

**G — Goal.** Pemisah halus antar area sesuai V-07, penanda aktif yang jelas.

| Aspek | Target |
|---|---|
| Masalah | Tidak ada pemisah antar area (riset §7 N-7); `activeProps` hanya `bg-surface-selected` tanpa penanda tambahan (N-6) |
| Target | (a) pemisah halus sesuai V-07; (b) item nav aktif mudah dikenali; (c) baris 2 disatukan bila V-03 memilih itu |
| Acceptance | 1) pemisah memakai token `border`; 2) item aktif punya penanda yang kontras jelas; 3) status aktif tetap diumumkan ke pembaca layar (`aria-current`); 4) tidak ada elemen dekoratif tanpa fungsi |

**R — Riset/Basis.** §7 N-4, N-6, N-7; §5 token `border`, `surface-selected`, `accent`.

**C — Context.** Baris 241: nav baris 2 memakai `border-t border-border`. `activeProps`
di baris 264: `bg-surface-selected text-primary`.

**A — Action.**
1. Tambah pemisah sesuai V-07 (mis. `border-l border-border` antar area di baris 1).
   Pastikan pemisah tersembunyi di layar kecil.
2. Perkuat penanda aktif: kombinasi latar + bobot teks, atau garis bawah tipis. Pilih satu
   gaya, jangan menumpuk tiga.
3. Bila V-03 memilih disatukan: hapus `border-t` di baris 241 dan ganti dengan jarak
   (`pt-*`), sehingga baris 1 dan 2 terlihat satu permukaan.
4. Jangan ubah `aria-label` atau struktur `nav`.

**O — Output.** `site-header.tsx` bagian pemisah & `activeProps`.
**Bukti wajib:** daftar kelas pemisah & active sebelum/sesudah.

**Gerbang G3:** pemisah memakai token; item aktif jelas; `aria-current` tetap ada.

---

## FASE 4 — Verifikasi (WAJIB)

### Prompt 4.1 — Regression & Consistency Guard

**Role:** Senior engineer (regression).

**M — Mindset.** Navbar dipakai di **semua** halaman. Perubahan kecil di sini berdampak
ke seluruh aplikasi. Yang paling berbahaya: fungsi yang hilang tanpa disadari.

**A — Action.** Periksa lewat pembacaan kode (bukan browser):
1. Semua fungsi masih ada: pencarian, submit, notifikasi, menu akun, keluar, Sheet mobile,
   navigasi baris 2, tombol menu mobile.
2. Tidak ada animasi/transisi yang berubah: bandingkan semua `transition-*` dan
   `duration-*` sebelum/sesudah.
3. `pt-safe`, `sticky top-0`, `z-40` tidak berubah.
4. Sheet mobile (baris 268-409) tidak tersentuh sama sekali.
5. Aksesibilitas: `aria-label`, `aria-expanded`, `focus-visible`, `min-h-11` masih ada.
6. Tidak ada `max-w-6xl` tersisa di navbar.
7. Halaman lain tidak terpengaruh (navbar satu komponen, tapi periksa tidak ada import
   baru yang rusak).

**O — Output.** Daftar per butir dengan status jujur. Laporkan yang gagal lebih dulu.
**Bukti wajib:** hasil grep sebelum/sesudah untuk setiap butir.

---

## Daftar 6 Role

| # | Role | Fase | Tanggung jawab inti | Kenapa dipisah |
|---|---|---|---|---|
| 1 | Product strategist | 0 | Keputusan V-01..V-07 | Lebar mengubah seluruh karakter |
| 2 | Layout width engineer | 1.1 | Lebar & padding | Akar kesan "tengah" |
| 3 | Density & typography engineer | 2.1 | Tinggi, pencarian, tipografi | Kepadatan tanpa merusak target sentuh |
| 4 | Divider & active state engineer | 3.1 | Pemisah, status aktif | Detail yang membuat terasa terstruktur |
| 5 | Regression guard | 4.1 | Fungsi & animasi utuh | Navbar dipakai semua halaman |
| 6 | Accessibility checker | 4.1 | Target sentuh, aria, fokus | Sering terlupakan saat mengejar gaya |

**Catatan pembagian.** Role 2 dan 3 sengaja dipisah: role 2 mengubah **lebar** (risiko
kesejajaran dengan konten), role 3 mengubah **kepadatan** (risiko target sentuh). Dua
risiko berbeda. Role 4 dan 6 juga dipisah: mengejar gaya SaaS mudah mengorbankan
aksesibilitas, jadi ada yang khusus memeriksanya.

---

## Gerbang Kualitas

| Gerbang | Syarat |
|---|---|
| G0 -> G1 | Tujuh keputusan Owner (V-01..V-07) tercatat |
| G1 -> G2 | Tidak ada `max-w-6xl` di navbar; padding kiri = kanan |
| G2 -> G3 | Tinggi sesuai keputusan; target sentuh >= 44px |
| G3 -> selesai | Pemisah memakai token; item aktif jelas; laporan regression jujur |

**Aturan tegas:** Fase 2 tidak dimulai sebelum Fase 1 lulus. Mengatur tinggi navbar yang
masih terkurung 1152px adalah merapikan ruangan yang ukurannya belum diputuskan.

---

## Yang DILARANG (langsung gagal)

- Mengubah animasi, durasi transisi, atau perilaku scroll
- Menghapus atau menyembunyikan fungsi apa pun
- Menyentuh Sheet mobile (baris 268-409)
- Mengubah `pt-safe`, `sticky top-0`, `z-40`
- Menambah warna, radius, atau shadow di luar token `styles.css`
- Glow, gradien dekoratif, emoji, bayangan bertumpuk
- Target sentuh < 44px
- Menghilangkan `aria-label` / `aria-current` / `focus-visible`
- Mengklaim "selesai" tanpa bukti grep sebelum/sesudah
- Menjalankan agent atau membuka browser
