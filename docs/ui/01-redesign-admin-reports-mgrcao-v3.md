# 01 — Redesign Halaman Admin Reports (MGRCAO V3 + anti-slop)

Tanggal: 2026-10-02 · Target: `/admin/reports` (`src/routes/_authenticated/admin/reports.tsx`)
Keputusan Owner: anti-slop **during**, dep baru **motion** boleh, **tanpa** background animasi.

---

## M — Mindset

Halaman data internal: keterbacaan angka > dekorasi. Every technique passes the purpose test.
**Design Read:** "internal admin analytics page, bahasa visual Ebrystore (ink-teal, low
elevation, trustworthy), dial **ENERGY 1 / RHYTHM 2 / MOTION 1**."

## G — Goal

| # | Masalah nyata sekarang | Target terukur |
|---|---|---|
| 1 | 11 kartu KPI identik tanpa hierarki (R-14) | 1 focal hero (Nilai transaksi) + 2 pendukung + strip statistik 3 grup semantik |
| 2 | 3 data ditampilkan dua kali (byType, byStatus, byMethod punya donut DAN tabel/list) (C-3) | Setiap himpunan data tampil **tepat sekali**: donut+legenda-tabel menyatu |
| 3 | 4 donut (monoton) (R-05) | 2 donut + 1 bar + 1 area = variasi komposisi |
| 4 | Periode pakai dropdown (2 klik) (arah "fast") | Segmented control 7/30/90/180 (1 klik) |
| 5 | Operator: UUID mentah, tanpa proporsi | Baris + progress bar completed/total (data nyata) |
| 6 | Angka statis | Count-up hanya pada angka hero (MOTION 1, satu tujuan: arahkan mata) |

## R — Role

UI engineer + copy minimal. Stack: Tailwind v4, Radix (ToggleGroup ada), Recharts, `motion` 13.5.

## C — Context

- `reports.tsx` 287 baris; komponen chart shared di `report-charts.tsx`; `RevenueTrendChart`
  juga dipakai `admin/index.tsx` → API-nya **tidak diubah**; `DonutChart`/`StatusBarChart`
  hanya dipakai reports.tsx → boleh dapat props opsional (`legend`, `showValues`).
- Data semuanya dari `getTransactionReport` (server-authoritative). R-17: tidak ada angka
  yang tidak datang dari respons; kosong = EmptyRow.
- CSP self-only; tidak ada aset eksternal baru. Palet: token CSS yang ada (chart-1..5,
  card, border, muted) — tidak ada warna baru (R-29).

## A — Action

1. `src/components/admin/report-widgets.tsx` (baru): `CountUp` (motion, hormati
   `useReducedMotion`), `MiniProgress`, `LegendRow`.
2. `report-charts.tsx`: props opsional `legend?: boolean` (DonutChart) dan
   `showValues?: boolean` (StatusBarChart + LabelList) — default perilaku lama.
3. Rewrite `reports.tsx`: header → toolbar periode (ToggleGroup) → hero band → strip
   statistik → tren → 3 kartu chart terkonsolidasi → operator → tabel harian.
4. Verify: lint 0 error file berubah, 70+ test hijau, build sukses, cek visual browser.

## O — Output

Halaman baru + widget + laporan dengan alasan per keputusan (R-31) dan bukti verifikasi.

**Alasan keputusan kunci (R-31):**
- Hero tunggal: satu focal point per layar; "Nilai transaksi" adalah angka yang ditanya
  pertama oleh admin.
- Count-up hanya di hero: satu aksen gerak, bukan template animation (R-19, MOTION 1).
- Legenda tabel menggantikan donut legend: menghilangkan duplikasi dan memberi angka
  eksak (donut hanya proporsi).
- Segmented control: akses paling sering di halaman ini adalah ganti periode.
- Tanpa background/gradient/glow: halaman angka, arah "low elevation, trustworthy".
