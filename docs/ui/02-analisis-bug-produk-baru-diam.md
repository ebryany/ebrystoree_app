# 02 — Analisis Bug: "Klik Produk Baru Hanya Diam" di Dashboard Seller

Tanggal: 2026-10-02 · Status: **DIAGNOSIS SELESAI; FIX ROUTING DITERAPKAN & TERVERIFIKASI** (lihat bagian 8)
Pelapor: owner (seller "citra", toko aktif, 0 produk) · Repro: akun seller di browser sesi ini

---

## 1. Gejala

Dari halaman daftar produk seller (`/seller/produk` — kartu toko "citra", badge "Aktif",
"Produk toko (0)"), seller mengklik tombol **"Produk baru"** maupun link **"Tambah"**
(dua-duanya menunjuk `/seller/produk/baru`). Tidak ada navigasi yang terlihat, tidak ada
toast, tidak ada form — "hanya diam saja".

## 2. Bukti Reproduksi (browser, akun seller asli)

Login sebagai akun seller, lalu:

| Langkah | Hasil teramati |
|---|---|
| Buka `/seller/produk` | Render benar: kartu toko + "Produk toko (0)" + tombol & link |
| Klik link "Produk baru" | URL berubah → `/seller/produk/baru`, judul tab → "Produk Baru — Ebrystore" |
| **Konten yang dirender** | **MASIH halaman daftar** ("Produk toko (0)" + tombol "Produk baru" + "Tambah") — form produk baru TIDAK PERNAH MUNCUL |

Jadi navigasinya sendiri **berhasil**; yang gagal adalah **render konten halaman
tujuan**. Dari sudut pandang user: "klik, tidak terjadi apa-apa".

## 3. Akar Masalah: Nesting Rute Tanpa `<Outlet />`

TanStack Router (file-based) memakai **titik dalam nama file sebagai nesting**:

```
src/routes/_authenticated/
├── seller.tsx                → layout /seller   (PUNYA <Outlet/> :163 ✓)
├── seller.produk.tsx         → /seller/produk   — SEKALIGUS LAYOUT untuk semua anak
│                                seller.produk.* — TIDAK PUNYA <Outlet/> ✗
├── seller.produk.baru.tsx    → /seller/produk/baru  (ANAK dari seller.produk)
└── seller.produk.$id.tsx     → /seller/produk/$id   (ANAK dari seller.produk)
```

Bukti parent-linkage (`src/routeTree.gen.ts:539-547`):

```
id: '/$id',   path: '/$id',   getParentRoute: () => AuthenticatedSellerProdukRoute,
id: '/baru',  path: '/baru',  getParentRoute: () => AuthenticatedSellerProdukRoute,
```

Mekanisme bug:

1. Router match `/seller/produk/baru` → chain render: `seller.tsx` → `seller.produk.tsx`
   → `seller.produk.baru.tsx`.
2. `seller.tsx` merender `<Outlet/>` → konten `seller.produk.tsx` tampil.
3. `seller.produk.tsx` (isi: daftar produk) **tidak punya `<Outlet/>`** → konten anak
   (`seller.produk.baru.tsx`, form produk baru) **dibuang** — tidak pernah masuk DOM.
4. Hasil: URL & title berubah, layar tetap daftar produk. Klik "Tambah" sama persis
   (tujuan sama), kesan "diam".

Counter-example yang membuktikan teori: `/seller/produk` sendiri tampil normal karena
`seller.tsx` (induknya) **punya** `<Outlet/>`.

## 4. Dampak

| Rute | Status | Dampak bisnis |
|---|---|---|
| `/seller/produk/baru` | **RUSAK** | Seller tidak bisa menambah produk sama sekali → pasokan marketplace nol |
| `/seller/produk/$id` (edit + upload file/kode stok, Prompt 14) | **RUSAK** (anak dari parent yang sama) | Meski bisa buat, seller tak bisa mengelola file/pengiriman |
| `/seller/produk` (daftar) | Sehat | — |

Bug ini memblokir sisi **supply** marketplace — setara bloker P0.

## 5. Kenapa Lolos Sampai Sekarang

1. Verifikasi Prompt 14–19 sebelumnya berbasis **review kode + test statis** — tidak ada
   E2E alur "seller klik tambah produk" (gap yang sudah dicatat di
   `docs/security/verification-evidence.md`).
2. `tsc` memang error di file-file seller, tetapi semua error itu kelas *stale typegen*;
   bug ini adalah **logika routing runtime** — tidak tampak dari compiler.
3. Seller baru pertama yang benar-benar mencoba (0 produk) — bug baru kena saat dipakai.

## 6. Arah Perbaikan (detail di framework 03)

**Opsi A (konvensi TanStack, direkomendasikan):**
- Pindahkan isi daftar ke `seller.produk.index.tsx` (index child → tampil di
  `/seller/produk`).
- Ubah `seller.produk.tsx` menjadi layout passthrough yang merender `<Outlet />`
  (+ meta bila perlu).

**Opsi B:** hapus `seller.produk.tsx`, buat `seller.produk.index.tsx` — hasil URL sama,
file lebih sedikit, tapi mengubah struktur nesting lebih dalam.

Verifikasi wajib setelah fix: klik "Produk baru" → form muncul; submit produk uji
(berpenanda) → toast + redirect ke `/seller/produk/$id` → halaman edit (termasuk
section File & Pengiriman) tampil → bersihkan produk uji; + audit seluruh keluarga
rute bertitik lain untuk pola yang sama.

## 7. Batasan

Diagnosis via repro aktif + bukti statis (file:baris tercantum). Workspace bukan repo
git — eksekusi fix wajib menyalin konten lama sebelum restrukturisasi (tidak ada
revert VCS).


---

## 8. Hasil Eksekusi Fix (2026-10-02, sesuai framework 03)

**Perubahan:** daftar produk pindah ke `seller.produk.index.tsx`;
`seller.produk.tsx` menjadi layout passthrough `<Outlet />`. Backup konten lama:
`docs/ui/backups/seller.produk.tsx.bak`. Catatan: dev server ternyata sudah mati
saat eksekusi — dijalankan ulang, routeTree ter-regenerate otomatis.

**Verifikasi klik-through (akun seller asli):**

| Kriteria | Hasil |
|---|---|
| G-1 Klik "Produk baru" -> form tampil | PASS (textbox "Nama produk" ada di DOM) |
| G-2 Submit produk uji -> toast + redirect ke edit | PASS (`/seller/produk/0b2fd5f8-...`, judul "Kelola Produk") |
| G-3 Halaman edit render (badge "Menunggu moderasi", section File & Pengiriman, Simpan/Ajukan/Hapus) | PASS (setelah reload; lihat temuan B) |
| G-4 Daftar `/seller/produk` tidak berubah perilaku | PASS |
| G-5 Audit Outlet semua parent route | PASS (dashboard, operator, seller, admin, root - semua YA) |
| G-6 Regresi | PASS: lint 0 error - 73/73 test - build sukses - mobile 390px overflow 0 di kedua halaman |

## 9. Temuan Baru Saat Verifikasi (bug TERPISAH, belum diperbaiki)

**B - Tombol "Hapus" (arsip produk) seller GAGAL dengan RLS violation.**
Repro: klik Hapus -> confirm -> toast "Produk gagal dihapus."; log server:
`[archiveMyProduct] ... error: new row violates row-level security policy for table "digital_products"`.
- Sementara **Simpan (UPDATE via saveMyProduct) SUKSES** pada baris yang sama ->
  permission `seller.products.manage` dan match toko terbukti sah.
- Policy repo (`products_update_seller_own`: USING store+permission, WITH CHECK
  store) tidak mungkin gagal selektif hanya untuk `deleted_at` - diduga kuat ada
  **drift antara DB ter-deploy dan migrasi repo** (policy tambahan di DB yang tidak
  ada di repo; selaras risiko L-10: `.env` vs `config.toml` beda project).
- Status: `UNKNOWN` sampai `pg_policies` DB ter-deploy diperiksa. Kandidat fix:
  RPC SECURITY DEFINER `archive_my_product` dengan otorisasi server-side, atau
  sinkronisasi policy DB.
- Sisa data uji: produk `UJI-DEBUG Routing 20261002` (draft, Rp10.000) TIDAK bisa
  dihapus karena bug ini - tertinggal di dev DB sebagai penanda.

**C - Race kecil pasca-submit:** tepat setelah redirect dari form baru, halaman edit
sempat menampilkan "Produk tidak ditemukan." lalu tampil normal setelah reload
(invalidasi query terjadi sebelum fetch selesai). Kecil, UX saja, tidak blokir.
