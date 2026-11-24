---
name: ebrystore-codebase-discovery
description: Inspects the existing EBRYSTORE repository to map its actual stack, folders, entry points, frontend, backend, database, integrations, tests, and deployment without inventing project facts.
---

# EBRYSTORE Codebase Discovery

## Tujuan
Membangun pemahaman akurat tentang repository sebelum desain atau perubahan. Gunakan untuk repository yang belum dipahami, perubahan lintas modul, atau konteks yang usang.

## Prosedur
1. Konfirmasi workspace root dan branch aktif.
2. Periksa `git status`, staged/unstaged changes, dan untracked files; jangan menghapus atau merapikannya otomatis.
3. Temukan manifest/lockfile untuk package manager, scripts, dependencies, framework, runtime.
4. Temukan entry points, routing, layouts, frontend modules, server functions, API handlers, middleware, shared libraries.
5. Temukan migrations/schema, generated types, RLS, RPC, triggers, views, storage policies bila ada.
6. Temukan auth/session, roles/permissions, payment/webhooks, notifications, external integrations bila ada.
7. Temukan test configuration, fixtures, CI workflows, build/deploy configuration, logging, monitoring.
8. Ikuti alur modul relevan melalui caller/callee dan data flow; jangan membaca semua file tanpa alasan.

## Status informasi
- OBSERVED: ditemukan langsung pada file/config/command output.
- OWNER_CONTEXT: diberikan pemilik, belum dibuktikan.
- INFERRED: kesimpulan sementara.
- UNKNOWN: belum diketahui.
- BLOCKED: akses/tool tidak tersedia.
- CONFLICT: sumber bertentangan.

Jangan mengubah OWNER_CONTEXT atau INFERRED menjadi OBSERVED tanpa pemeriksaan.

## Output
Buat/perbarui `PROJECT_CONTEXT.md` bila berguna dan belum ada sumber setara. Catat stack/versi, struktur penting, entry points, domain, frontend/backend boundaries, database/auth, API/integrations, tests/build scripts, deployment/operations, risks/unknowns, bukti path/perintah, tanggal pemeriksaan.

Jika dokumen konteks sudah ada, perbarui tanpa duplikasi atau menghapus keputusan yang masih berlaku.

## Guardrails
Jangan membuka/mencetak secret; catat nama env var, bukan nilainya. Jangan menjalankan skrip tidak dikenal atau perintah destructive. Jangan menyimpulkan production dari konfigurasi lokal. Jangan mengubah source code dalam mode discovery.
