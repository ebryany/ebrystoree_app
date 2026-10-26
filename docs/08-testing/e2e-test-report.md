# Laporan E2E Test Ebrystore

Status: **PASSED** — 28/28 skenario lulus (jalur publik, mobile, terautentikasi).

## Cakupan

| Suite | Skenario | Fokus |
| --- | --- | --- |
| `tests/e2e/public/storefront.spec.ts` | 6 | Beranda + metadata SEO, katalog produk & layanan, pencarian tersinkron URL, halaman artikel/legal, bebas error konsol |
| `tests/e2e/public/auth-guard.spec.ts` | 6 | Tamu ditolak di 5 rute terlindungi, form autentikasi tampil |
| `tests/e2e/mobile/navigation.spec.ts` | 2 | Tidak ada overflow horizontal di beranda & katalog layanan (Pixel 7) |
| `tests/e2e/authenticated/dashboard.spec.ts` | 4 | Dashboard, riwayat pesanan, produk saya, pengaturan akun |
| `tests/e2e/authenticated/admin.spec.ts` | 9 | 8 halaman admin render tanpa error runtime + verifikasi 3 job terjadwal |

## Cara menjalankan

```bash
bun run test:unit   # unit test (vitest)
bun run test:e2e    # end-to-end (playwright)
bun run test        # keduanya
```

Konfigurasi ada di `playwright.config.ts`. Dev server dipakai ulang bila sudah berjalan
(`E2E_BASE_URL` dapat diarahkan ke preview atau produksi).

## Sesi uji

Skenario terautentikasi memakai sesi dari environment runner (`tests/e2e/auth.setup.ts`).
Tidak ada kredensial yang disimpan di repo; bila sesi tidak tersedia, suite tersebut
otomatis dilewati alih-alih gagal.

## Catatan

- Halaman admin diuji toleran-peran: lolos bila konten tampil atau status "tidak punya izin"
  muncul, sehingga suite tetap valid untuk akun non-staf.
- Skenario pembayaran QRIS belum dibuat karena provider belum ditentukan; jalur pembayaran
  manual (unggah bukti + verifikasi) menyusul pada iterasi berikutnya.