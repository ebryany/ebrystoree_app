# Admin Security Monitoring Center

Panduan implementasi dashboard pemantauan keamanan yang terintegrasi penuh di `/admin/settings/security` (`src/routes/_authenticated/admin/settings.security.tsx` & `src/lib/security.functions.ts`).

## Fitur Utama

1. **Akses Terkontrol RBAC:**
   - Menu **Akses -> Pusat Keamanan** di `src/lib/admin-nav.ts`.
   - Memerlukan permission `security.events.read` (atau `settings.view` untuk admin). Perubahan status event membutuhkan `security.events.resolve`, sedangkan pengelolaan alert membutuhkan `security.alerts.manage` (`super_admin`).
2. **Overview KPI & Rentang Waktu (`24 Jam`, `7 Hari`, `30 Hari`):**
   - **Total Percobaan Tercatat** (`totalEvents` & jumlah grup unik).
   - **Akses Ditolak (`401` / `403`)** (rincian tanpa sesi vs ditolak izin).
   - **Event Kritis & Tinggi** (termasuk ringkasan `Rate Limit 429` & `Webhook/Token Gagal`).
   - **Security Alerts Aktif** (`OPEN` / `INVESTIGATING`).
   - Panel **Endpoint Paling Sering Disasar** & **IP Terbanyak Ditolak**.
3. **Tabel Interaktif Security Events & Detail Drawer (`Sheet`):**
   - Filter berdasarkan `Severity`, `Status Investigasi`, dan pencarian teks (`endpoint`, `IP`, `Request ID`, `event_type`, `reason_code`).
   - Klik `Detail` membuka `Sheet` berisi `Request Reference ID`, frekuensi kemunculan (`occurrence_count`), detail aktor/IP/UA, `sanitized_metadata`, form update status (`NEW`, `INVESTIGATING`, `ACKNOWLEDGED`, `RESOLVED`, `FALSE_POSITIVE`), serta **Riwayat Investigasi** (`security_event_histories`).
   - Setiap perubahan status juga ditulis ke `audit_logs` admin.
4. **Live Updates (`useRealtimeRefresh`):**
   - Berlangganan publikasi Realtime Postgres untuk tabel `security_events` dan `security_alerts` (terlindungi RLS), ditambah tombol `Muat ulang`.
5. **Postur Database & RLS (Tab 3):**
   - Tetap memantau real-time jumlah tabel public dengan RLS, hak tulis `anon`, fungsi `anon`, fungsi `SECURITY DEFINER` tanpa `search_path`, dan status privasi bucket Storage.
