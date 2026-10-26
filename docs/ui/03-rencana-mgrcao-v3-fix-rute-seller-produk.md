# 03 — Framework MGRCAO V3: Fix Rute Seller Produk (Bug "Klik Diam")

Tanggal: 2026-10-02 · Sumber analisis: [`02-analisis-bug-produk-baru-diam.md`](./02-analisis-bug-produk-baru-diam.md)
Status: **RENCANA — MENUNGGU KONFIRMASI OWNER SEBELUM EKSEKUSI**

---

## M — Mindset

1. **Routing adalah kontrak, bukan detail**: nama file di `src/routes/` menentukan siapa
   layout siapa anak. Understand-before-generate — petakan nesting dulu, baru ubah.
2. **Bukti-before-claim**: bug ini lolos karena pernah dianggap "selesai" tanpa klik
   dalam. Setiap acceptance criteria di bawah diverifikasi dengan **klik nyata di
   browser** dengan akun seller, bukan hanya build hijau.
3. **Perubahan terkecil**: pindahkan konten, jangan tulis ulang. Tidak ada perubahan
   server function, RLS, atau RPC dalam fix ini.
4. **Ruang kerja tanpa git**: sebelum restrukturisasi, salin konten file lama ke
   `docs/ui/backups/` (BUKAN di dalam `src/routes/` — file liar di situ bisa ikut
   terbaca sebagai rute).
5. **Anti AI-slop**: tidak menambah UI baru; hanya menata ulang rute yang sudah ada.

## G — Goal (acceptance criteria terukur)

| # | Target | Cara membuktikan |
|---|---|---|
| 1 | Klik "Produk baru" di `/seller/produk` → **form produk baru tampil** | Browser akun seller: URL `/seller/produk/baru` + form (input Nama/Harga) ada di DOM |
| 2 | Submit form dengan data uji → produk dibuat + redirect ke halaman edit | Toast sukses + URL `/seller/produk/$id` + halaman edit render (termasuk section File & Pengiriman) |
| 3 | Halaman edit (`seller.produk.$id`) kini bisa diakses | DOM: judul produk + section file tampil |
| 4 | `/seller/produk` (daftar) tidak berubah perilaku | DOM: "Produk toko (N)" + tombol + empty state seperti sebelumnya |
| 5 | Tidak ada keluarga rute lain dengan pola sama | Audit: setiap file route yang punya "anak" (dicek via routeTree `getParentRoute`) mengandung `<Outlet />` — hasil ditarikan di laporan |
| 6 | Regresi tidak terjadi | `npm run test:unit` 73+ hijau, lint 0 error, build sukses, mobile 390px overflow 0 di dua halaman |

## R — Role

Frontend engineer (routing & layout TanStack). Satu peran; tidak menyentuh backend.

## C — Context (fakta terkunci dari analisis 02)

- `seller.produk.tsx` TIDAK punya `<Outlet />`; anak-annya `seller.produk.baru.tsx`
  (`/baru`) dan `seller.produk.$id.tsx` (`/$id`) terikat `getParentRoute:
  AuthenticatedSellerProdukRoute` (`routeTree.gen.ts:539-547`).
- `seller.tsx` PUNYA `<Outlet />` (:163) — kontras yang membuktikan mekanisme.
- `routeTree.gen.ts` adalah file **generated** — diubah oleh plugin router saat dev
  server berjalan; jangan diedit manual. Setelah pindah file, verifikasi file ini
  ter-regenerasi (memuat referensi `seller.produk.index`).
- Workspace bukan repo git → backup dulu ke `docs/ui/backups/`.
- Akun uji seller tersedia (dipakai saat repro); produk uji wajib berpenanda
  `UJI-DEBUG` dan dibersihkan (diarsipkan) setelah verifikasi.

## A — Action (urutan eksekusi)

1. **Backup**: salin `seller.produk.tsx` (utuh) → `docs/ui/backups/seller.produk.tsx.bak`.
2. **Pindah konten daftar**: buat `src/routes/_authenticated/seller.produk.index.tsx`
   dengan seluruh isi komponen daftar (route id `/seller/produk/`, index child).
3. **Layout passthrough**: tulis ulang `seller.produk.tsx` menjadi layout minimal
   yang hanya merender `<Outlet />` (+ `head` meta bila kontennya relevan).
4. **Regenerasi**: pastikan dev server aktif → cek `routeTree.gen.ts` memuat
   `SellerProdukIndexRoute`; bila tidak ter-generate otomatis, restart dev server.
5. **Verifikasi browser** (akun seller): jalankan G-1..G-4 berurutan, catat bukti
   URL/DOM/screenshot.
6. **Bersihkan data uji**: arsipkan produk `UJI-DEBUG` lewat UI seller.
7. **Audit keluarga rute** (G-5): grep semua `getParentRoute` di routeTree → daftar
   route yang punya anak → cek `<Outlet />` di file induk masing-masing → laporan.
8. **Regresi**: eslint file terubah, `npm run test:unit`, `npm run build`,
   mobile 390px overflow di `/seller/produk` & `/seller/produk/baru`.
9. **Laporan**: file berubah + bukti per acceptance criteria + status jujur.

## O — Output

1. Tiga file rute tertata (`produk.tsx` = layout, `produk.index.tsx` = daftar, dua anak
   tidak disentuh), routeTree regenerated.
2. Laporan evidence dengan bukti klik-through (G-1..G-6) dan hasil audit G-5.
3. Produk uji dibersihkan (arsip), dicatat di laporan.
4. Delivery gate anti-slop: tanpa UI baru tanpa purpose; em-dash 0; overflow 0;
   kontrol semua berfungsi.
5. Catatan untuk Decision Register / docs: pelajaran — "route family perlu audit
   Outlet" masuk checklist QA (Prompt 39-40 paket marketplace).

### Non-goals (dilarang masuk)

- Menyentuh `saveMyProduct`, RLS, moderasi, atau backend mana pun.
- Redesign visual halaman seller.
- Memperbaiki tsc stale-typegen (masih terpisah, P0-A peta 04).

### Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| routeTree tidak ter-regenerate (dev server idle) | Restart dev server; verifikasi referensi index muncul |
| Salah pindah konten (tanpa git) | Backup di `docs/ui/backups/` sebelum eksekusi; rollback = pulihkan file lama + hapus index |
| Halaman lain ikut ke-render beda | G-4 (daftar identik) + audit G-5 sebelum lapor selesai |
