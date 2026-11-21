# EBRYSTORE Performance & Load Testing Suite (Grafana k6)

Suite pengujian performa berbasis **Grafana k6** untuk mengevaluasi kapasitas EBRYSTORE hingga **1.000+ virtual users** secara aman dan dapat direproduksi.

> **Keamanan Produksi:** Jangan pernah menjalankan load/stress/spike/breakpoint test ke `https://app.ebrystore.my.id` tanpa jendela uji dan persetujuan eksplisit. Gunakan lingkungan staging terotorisasi atau runner lokal terisolasi (`run-isolated-benchmark.mjs`) yang memakai `mock-supabase.mjs`.

## Skenario Tersedia

| File | Jenis Uji | Executor k6 | Tujuan |
|---|---|---|---|
| `smoke.js` | Smoke Test | `constant-vus` (5 VUs) | Verifikasi fungsionalitas dasar di beban minimal |
| `load.js` | Load Test | `ramping-vus` (→ 1.000 VUs) | Menguji kapasitas target 1.000 concurrent VUs dengan think-time realistis |
| `stress.js` | Stress Test | `ramping-vus` (→ 1.500 VUs) | Menguji beban di atas target untuk melihat degradasi & stabilitas |
| `spike.js` | Spike Test | `ramping-vus` (20 → 1.000 VUs) | Menguji lonjakan trafik mendadak (flash sale / viral) |
| `soak.js` | Soak Test | `constant-vus` (200 VUs) | Menguji kestabilan jangka panjang, memory leak, dan drift latensi |
| `breakpoint.js` | Breakpoint Test | `ramping-arrival-rate` (20 → 600+ RPS) | Mencari titik pasti batas RPS sebelum p95 > 2s atau error > 5% |

## Menjalankan Benchmark Terisolasi (Lokal, Tanpa Menyentuh Produksi)

Pastikan build produksi sudah tersedia (`$env:NITRO_PRESET='node-server'; npm run build`), lalu jalankan:

```bash
node tests/perf/run-isolated-benchmark.mjs --label baseline
```

Hasil ringkasan tersimpan di `tests/perf/.results/<label>-summary.json` (masuk `.gitignore`).

## Menjalankan ke Lingkungan Staging Terotorisasi

```bash
BASE_URL="https://staging.ebrystore.my.id" k6 run tests/perf/smoke.js
BASE_URL="https://staging.ebrystore.my.id" PEAK_VUS=1000 k6 run tests/perf/load.js
```

Variabel opsional:
- `PRODUCT_SLUG`: slug produk untuk skenario detail produk & checkout shell.
- `CATEGORY_SLUG`: slug kategori untuk penjelajahan kategori.
- `TEST_AUTH_TOKEN`: token akun uji staging (jangan gunakan akun produksi nyata).
- `THINK_SCALE`: faktor pengali jeda antar aksi (default `1`).
- `FAST=1`: durasi stage dipersingkat untuk validasi cepat CI/lokal.
