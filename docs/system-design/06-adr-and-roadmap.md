# 12. Architecture Decision Records & 13. Implementation Roadmap

## 12. Architecture Decision Records (ADR)

### ADR-001: Modular Monolith dengan TanStack Start SSR + Nitro `node-server`
- **Context**: Aplikasi membutuhkan SEO publik, rendering cepat, API backend/webhook, serta ekosistem Node.js (`nodemailer`, `sharp`).
- **Problem**: Memilih antara arsitektur microservices/serverless murni vs modular monolith SSR.
- **Alternatives**: (1) SPA terpisah + REST backend terpisah; (2) Cloudflare Workers; (3) TanStack Start Modular Monolith di VPS `node-server`.
- **Decision**: Mempertahankan **TanStack Start Modular Monolith dengan Nitro `node-server`** (`VERIFIED`).
- **Trade-offs**: Deployment berbasis arsip `.output` ke VPS lebih sederhana dan mendukung penuh modul Node.js, dengan konsekuensi skala vertikal berada pada satu node VPS hingga dibutuhkan load balancer.
- **Status**: **Accepted (Active in Production)**.

### ADR-002: Business Logic Finansial & Transaksi di PostgreSQL RPC (`SECURITY DEFINER`)
- **Context**: Checkout, kredit toko, escrow jasa, dan pencairan dana melibatkan banyak tabel dan rentan race condition.
- **Problem**: Menjamin atomicity dan mencegah manipulasi harga/saldo dari klien.
- **Alternatives**: (1) Orkestrasi multi-query di aplikasi Node.js; (2) Stored procedure / RPC PostgreSQL dengan advisory lock & RLS.
- **Decision**: Memusatkan seluruh mutasi finansial dan transisi state kritis di **PostgreSQL RPC + Trigger** (`VERIFIED`).
- **Trade-offs**: Konsistensi ACID kuat dan aman dari bypass klien, tetapi perubahan aturan bisnis memerlukan file migrasi SQL teruji.
- **Status**: **Accepted (Active)**.

### ADR-003: Dual-Layer Authorization (`requireSupabaseAuth` + `assertPermission` + RLS)
- **Context**: Platform melayani 7 role berbeda dan 51 MCP tool.
- **Problem**: Mencegah IDOR dan eskalasi hak akses antar-vendor maupun staf.
- **Decision**: Memakai JWT user-scoped Supabase client di server functions & MCP (`authGuard`), `assertPermission` untuk endpoint staf, serta RLS + column/trigger guards di database (`VERIFIED`).
- **Trade-offs**: Penambahan fitur baru wajib mendefinisikan permission & policy RLS dengan disiplin.
- **Status**: **Accepted (Active)**.

### ADR-004: Rate Limiting Fail-Closed pada Bucket Finansial
- **Context**: Endpoint checkout, bukti bayar, QRIS, refund, dan top-up berisiko abuse/spam.
- **Problem**: Bagaimana perilaku sistem jika mekanisme limiter mengalami gangguan?
- **Decision**: `enforceRateLimit` bersifat **fail-closed** pada seluruh bucket finansial dan **fail-open** pada bucket non-finansial (`VERIFIED` di `rate-limit.server.ts` & `rate-limit.test.ts`).
- **Status**: **Accepted (Active)**.

### ADR-005: Pengaturan Admin Dinamis Berbasis Registry Tervalidasi (`system_settings`)
- **Context**: Terdapat 146 key pengaturan website, transaksi, fitur, dan keamanan.
- **Problem**: Mencegah pengaturan UI yang tersimpan tetapi tidak berdampak atau membuka konfigurasi `readOnly`.
- **Decision**: Memvalidasi field lewat registry `website-settings.ts`, memblokir perubahan `readOnly`, membersihkan cache publik saat simpan, dan menghubungkan pembacaan di server (`website-settings.server.ts`), frontend (`useWebsiteSettings`), dan SQL (`setting_int`/`setting_bool`/`setting_text`) (`VERIFIED`).
- **Status**: **Accepted (Active)**.

---

## 13. System Design Validation & Implementation Roadmap

### 13.1 Hasil Architecture Review (`VERIFIED` & `INFERRED`)
Pemeriksaan konsistensi arsitektur menemukan poin berikut yang perlu menjadi perhatian engineering selanjutnya:
1. **Database Migration Drift Risk (`VERIFIED`)**: Terdapat migrasi baru di repository (`20261121132000_*`, `20261121150000_*`, `20261121160000_*`) yang sudah ter-commit di `main` tetapi status penerapannya di Supabase produksi harus dipastikan sinkron.
2. **Single Point of Failure VPS (`INFERRED`)**: Aplikasi web berjalan pada satu instance VPS (`43.156.83.235`). Belum ada health endpoint terdedikasi (`/api/health`) atau monitoring uptime/error rate otomatis di luar log `systemd`.
3. **ShopeePay & Komisi Marketplace (`VERIFIED`)**: Adapter ShopeePay (`shopeepay.server.ts`) dan dukungan `partial_refund` tersedia secara arsitektural namun dinonaktifkan via konfigurasi sampai keputusan bisnis final.
4. **Build Target Mismatch Notice (`CONFLICT`)**: Komentar `vite.config.ts` menyebut default Nitro Cloudflare, sedangkan rilis produksi wajib memakai `NITRO_PRESET=node-server`.

### 13.2 Implementation Roadmap (Prioritas Rekomendasi)

| Fase | Prioritas | Item Pekerjaan | Dependensi / Syarat | Kriteria Validasi |
|---|---|---|---|---|
| **Fase 1** | **P0 (Segera)** | Sinkronisasi & verifikasi 3 migrasi SQL terbaru ke Supabase produksi | Akses Supabase Dashboard / CLI pemilik | Query fungsi `next_invoice_number`, `apply_as_seller`, `resolve_service_complaint` & trigger berjalan tanpa error |
| **Fase 2** | **P1 (Jangka Pendek)** | Tambahkan endpoint `/api/health` + script verifikasi pasca-deploy & log rotation check | Persetujuan perubahan kode | `GET /api/health` mengembalikan `200` dengan pengecekan DB non-sensitif |
| **Fase 3** | **P1 (Jangka Pendek)** | Integrasi test suite SQL RPC terhadap instance Supabase lokal (`supabase start`) | Docker / Supabase CLI di CI atau lokal | Uji integrasi `create_digital_order`, `open_service_complaint`, dan `apply_as_seller` lulus otomatis |
| **Fase 4** | **P2 (Menengah)** | Dokumentasikan & aktifkan backup otomatis terverifikasi + alert error/latency | Akses konfigurasi VPS & observability tool | Uji restore database & alert test berhasil |
| **Fase 5** | **P3 (Sesuai Keputusan Bisnis)** | Aktivasi komisi marketplace, ShopeePay Dynamic QR, dan KYC seller bila disetujui pemilik | Keputusan bisnis & kredensial produksi | UAT end-to-end dan audit keamanan lulus sebelum rilis |
