# AS-1 — Copy Cleanup & Penghapusan Konteks Lama

Status: **AS-1 VERIFIED**
Tanggal: 2026-07-28

## Keputusan Owner yang diterapkan

| Kode | Keputusan | Implementasi |
|---|---|---|
| OD-AS-01 | Menu publik "Bantuan Tugas", judul formal "Pendampingan Akademik" | header/footer/home/katalog/checkout/admin |
| OD-AS-02 | Data uji diarsipkan, bukan dihapus | kolom `is_test_data` + status `archived` |
| OD-AS-03 | Pricing paket tetap + add-on urgensi | rencana AS-2 (belum dieksekusi) |
| OD-AS-04 | Quality reviewer wajib untuk proposal/skripsi/analisis lanjut/premium/high-risk | rencana AS-2 (`requires_quality_review`) |
| OD-AS-05 | Pemeriksaan kesamaan manual/laporan provider | tidak ada klaim otomatis di copy manapun |

## Matriks penggantian copy

| Lama | Baru |
|---|---|
| Jasa Joki Terpercaya (metadata) | Pendampingan Akademik |
| Layanan Joki (menu) | Bantuan Tugas |
| Layanan joki (judul katalog) | Pendampingan Akademik |
| Layanan joki (label order) | Pesanan Akademik |
| Layanan Joki (admin nav/CRUD) | Layanan Akademik |
| Operator (copy publik jalur layanan) | Pendamping akademik |
| Placeholder "rank Gold III tercapai" | "Outline dan struktur tugas selesai diperiksa…" |
| Fixture "Joki Rank Mobile Legends" | "Review Struktur Makalah" |

## File yang diubah

```text
src/routes/__root.tsx
src/routes/index.tsx
src/routes/layanan.index.tsx
src/routes/layanan.$slug.tsx
src/routes/bantuan.tsx
src/routes/auth.tsx
src/routes/produk.index.tsx
src/routes/_authenticated/checkout.layanan.$slug.tsx
src/routes/_authenticated/dashboard.pesanan.index.tsx
src/routes/_authenticated/operator.$id.tsx
src/routes/_authenticated/admin/index.tsx
src/routes/_authenticated/admin/orders.index.tsx
src/routes/_authenticated/admin/layanan.tsx
src/components/site-header.tsx
src/components/site-footer.tsx
src/components/home/sections.tsx
src/lib/transaction-labels.ts
src/lib/admin-nav.ts
src/lib/admin.functions.ts
src/lib/admin-transaction.functions.ts  (laporan mengecualikan data uji)
src/lib/__tests__/authz.test.ts          (fixture akademik)
src/lib/__tests__/academic-copy.test.ts  (baru — regression AS-1)
```

## Field deprecated

- `requirements.akun` (ID akun / server) — input publik dihapus dari checkout,
  tidak dikirim pada payload baru, tidak divalidasi server, tidak dipakai untuk
  authorization. Data historis pada order lama **dibiarkan** untuk audit dan
  tidak ditampilkan di UI baru. Status: **DEPRECATED**.
- Checkout kini memuat larangan eksplisit: dilarang mengirim password, OTP,
  akses LMS, email kampus, atau kredensial pribadi.

## Arsip data uji

Migration menambahkan `is_test_data` pada `services`, `service_packages`,
`orders`, `digital_products` (default `false`, aditif, nullable-safe).

Data yang diarsipkan (tanpa hard delete):

| Objek | Aksi |
|---|---|
| layanan `sdsd` | `is_test_data = true`, `status = archived`, `deleted_at` diisi |
| layanan `dsd` | `is_test_data = true`, `status = archived`, `deleted_at` diisi |
| paket layanan uji | `is_test_data = true`, `is_active = false` |
| add-on layanan uji | `is_active = false` |
| 4 order uji | `is_test_data = true` |

Verifikasi database:

```text
test_services=2  test_orders=4  published_services=0  academic_categories=13
```

## Bukti pencarian

```bash
rg -ni 'joki|mobile legends|\brank\b|akun game|ID akun|gaming|boosting|win rate|leveling' src
# → 0 hasil (di luar routeTree.gen.ts yang auto-generated)
```

## Bukti test

```bash
bunx vitest run
# Test Files 2 passed (2) | Tests 11 passed (11)
```

Test AS-1 (`academic-copy.test.ts`):
1. tidak ada istilah joki/game aktif di `src/routes`, `src/components`, `src/lib`;
2. checkout tidak lagi memiliki field ID akun dan memuat larangan kredensial;
3. label tipe order = "Pesanan Akademik".

## Quality gate AS-1

| Kriteria | Status |
|---|---|
| Tidak ada copy game aktif | PASS |
| Istilah publik "joki" dihapus | PASS |
| Field ID akun hilang | PASS |
| Fixture game hilang | PASS |
| Placeholder rank hilang | PASS |
| Data uji diarsipkan | PASS |
| Storefront bersih (0 layanan uji published) | PASS |
| Regression test lulus | PASS |
| Evidence tersedia | PASS |

## Risiko tersisa

- Dokumen audit lama di `docs/` masih memuat istilah lama untuk keperluan histori
  (superseded, tidak dipakai runtime).
- Storefront layanan kini kosong (0 published) sampai layanan akademik nyata
  dibuat pada AS-2.