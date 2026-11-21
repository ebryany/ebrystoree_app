# EBRYSTORE — Quality Engineering & QA Knowledge Base

Dokumentasi ini berfungsi sebagai basis pengetahuan QA yang persisten, dapat direproduksi, dan berlaku lintas sesi maupun lintas model AI untuk proyek **EBRYSTORE**.

## Ringkasan Sistem Terverifikasi (21 November 2026)

| Komponen | Jumlah Terverifikasi | Sumber |
| :--- | ---: | :--- |
| Migrasi Database SQL | 139 file | `supabase/migrations/*.sql` |
| File Route (TanStack Router) | 117 file | `src/routes/` |
| Server Functions (`createServerFn`) | 263 fungsi | `src/lib/*.functions.ts` |
| Unit & Contract Test Files (Vitest) | 52 file (656 test cases) | `src/**/*.test.{ts,tsx}` |
| E2E Spec Files (Playwright) | 7 spec + 1 auth setup | `tests/e2e/` |

## Indeks Dokumen QA

- [QA_STRATEGY.md](./QA_STRATEGY.md) — Strategi pengujian multidisipliner berbasis risiko, test pyramid, dan tata kelola data uji.
- [TEST_MATRIX.md](./TEST_MATRIX.md) — Matriks keterlacakan kebutuhan bisnis, API, database, keamanan, dan frontend terhadap kasus uji.
- [DEFECT_REGISTER.md](./DEFECT_REGISTER.md) — Daftar defect aktif, temuan baseline 21 Nov 2026 yang sudah ditutup, dan gap pengujian.
- [RELEASE_READINESS.md](./RELEASE_READINESS.md) — Keputusan kesiapan rilis berdasarkan bukti eksekusi aktual.

## Perintah Verifikasi Standar

```powershell
npx tsc --noEmit          # Typecheck seluruh source & test
npm run lint              # ESLint (0 error; baseline warning terdokumentasi)
npm run test:unit         # 52 file / 656 unit & contract tests (Vitest)
npm audit --omit=dev      # Audit kerentanan dependensi produksi
npm run verify            # typecheck + lint + test:unit + build
```
