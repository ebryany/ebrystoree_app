# Pengaturan Website — Admin Ebrystore

Status: IMPLEMENTED · Rute: `/admin/settings/website`

## Arsitektur

| Lapisan | Berkas | Peran |
|---|---|---|
| Registry | `src/lib/website-settings.ts` | Sumber kebenaran key, tipe, default, sifat publik, validasi |
| Baca server | `src/lib/website-settings.server.ts` | Baca nilai publik (anon) + penegakan feature flag |
| Server fn | `src/lib/website-settings.functions.ts` | `getPublicWebsiteSettings`, `getWebsiteSettings`, `saveWebsiteSection`, `resetWebsiteSection` |
| UI admin | `src/routes/_authenticated/admin/settings.website.tsx` | 11 bagian, validasi inline, dirty state, pratinjau |
| Konsumsi publik | `src/hooks/use-website-settings.ts` | Dibaca dari root loader (SSR-safe) |

## Aturan

- Nilai disimpan di `system_settings` (`is_public` mengikuti registry). Key yang belum tersimpan memakai default registry.
- Validasi dijalankan ulang di server; satu field gagal → tidak ada yang disimpan.
- Setiap perubahan menulis `audit_logs` (`entity_type = website_setting`) dengan nilai sebelum/sesudah; nilai sensitif diredaksi.
- Izin: `settings.website.view` untuk membuka halaman; setiap bagian punya izin ubah sendiri; reset butuh `settings.dangerous.update` (super admin).
- Link legal (`/syarat-ketentuan`, `/kebijakan-privasi`, `/kebijakan-refund`) tidak dapat dihapus atau dinonaktifkan.
- Feature flag ditegakkan di server: `createDigitalOrder`, `createServiceOrder`, dan `createAcademicOrder` menolak order baru saat flag mati.
- Maintenance mode menutup halaman publik, tetapi `/api`, `/auth`, `/admin`, `/operator` dan staf tetap dapat mengakses.

## Evidence (2026-07-29)

- Simpan tagline dari UI → baris `system_settings.site_tagline` ter-upsert.
- `audit_logs` mencatat `website_setting_created` dengan `reason=group=umum key=site_tagline`.
- HTML SSR halaman depan langsung menampilkan nilai baru.
- `bunx vitest run` → 11 test lulus; typecheck bersih.