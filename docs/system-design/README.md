# EBRYSTORE — Master System Design & Technical Specification

Paket dokumentasi ini adalah acuan arsitektur dan spesifikasi teknis **EBRYSTORE** berdasarkan inspeksi langsung (*evidence-based discovery*) terhadap repository aktual per **2026-11-21**.

> [!NOTE]
> Dokumen historis di `docs/00-product/` s.d. `docs/12-decisions/` merekam fase pra-implementasi (`SPECIFICATION_IN_PROGRESS`). Paket `docs/system-design/` ini merekonstruksi arsitektur aktual (*As-Is*) sekaligus menetapkan rancangan target (*To-Be*), ADR, dan roadmap rekayasa ke depan.

## Klasifikasi Bukti

Setiap klaim teknis dalam paket ini diklasifikasikan sebagai:

- **VERIFIED**: ditemukan dan diperiksa langsung di source code, konfigurasi, skema migrasi, atau output build/test.
- **USER CONTEXT**: informasi bisnis/operasional yang diberikan pemilik proyek (termasuk `AGENTS.md`, `PROJECT_BRIEF_2026.md`, dan instruksi sesi).
- **INFERRED**: kesimpulan arsitektural berdasarkan pola kode dan konfigurasi yang ada.
- **UNKNOWN**: belum dapat dipastikan dari repository saja (mis. konfigurasi runtime aktual di `.env` VPS atau dashboard Supabase produksi).
- **CONFLICT**: ketidaksesuaian antar-sumber (mis. dokumen lama `docs/README.md` menyebut implementasi belum dimulai padahal codebase sudah berjalan di produksi; `vite.config.ts` default Nitro ke Cloudflare sementara deploy produksi memakai `NITRO_PRESET=node-server`).
- **BLOCKED**: tidak diperiksa karena batasan mandat/akses (mis. isi `.env` produksi atau log runtime VPS).

## Daftar Dokumen (Deliverables 01–13)

| File | Cakupan Deliverable |
|---|---|
| [01-system-overview-and-requirements.md](./01-system-overview-and-requirements.md) | **01. System Overview** & **02. Requirements Specification** |
| [02-architecture-as-is-and-to-be.md](./02-architecture-as-is-and-to-be.md) | **03. Current Architecture (As-Is)** & **04. Target Architecture (To-Be)** + C4 Model |
| [03-frontend-and-backend-architecture.md](./03-frontend-and-backend-architecture.md) | **05. Frontend Architecture** & **06. Backend Architecture** |
| [04-database-and-security-design.md](./04-database-and-security-design.md) | **07. Database Design** & **08. Security Design** |
| [05-integration-infrastructure-and-flows.md](./05-integration-infrastructure-and-flows.md) | **09. Integration**, **10. Infrastructure**, & **11. Data Flow & Sequence** |
| [06-adr-and-roadmap.md](./06-adr-and-roadmap.md) | **12. Architecture Decision Records (ADR)** & **13. Implementation Roadmap** |
