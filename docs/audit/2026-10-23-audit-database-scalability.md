# Ebrystore Database Scalability, Performance & Reliability Audit

Tanggal: 2026-10-23 · Mode: **AUDIT ONLY — READ-ONLY**
Tidak ada schema, data, index, RLS, atau konfigurasi yang diubah.

---

## A. Executive Summary

**Kesimpulan utama: database Ebrystore belum membutuhkan scaling apa pun.**

Ini bukan kesimpulan dari jumlah tabel, melainkan dari pengukuran. Dataset produksi saat ini:

| Tabel | Baris |
|---|---:|
| `digital_products` | 3 |
| `orders` | 14 |
| `order_items` | 14 |
| `payments` | 14 |
| `refunds` | 0 |
| `credit_ledger` | 0 |
| `seller_ledger` | 5 |
| `notifications` | 112 |
| `audit_logs` | 182 |
| `analytics_events` | 608 |
| `scheduled_job_runs` | **4.879** |
| `profiles` | 34 |

Dengan volume ini, **setiap** rekomendasi "butuh read replica", "butuh Redis", "butuh
partitioning", atau "butuh upgrade compute" adalah spekulasi tanpa dasar.

**Latency terukur (dari mesin audit, bukan dari server aplikasi):**

| Query | Waktu |
|---|---:|
| `digital_products` filter published, limit 12 | 0,449 s |
| `orders` limit 15 | 0,214 s |
| `notifications` limit 20 | 0,200 s |
| `scheduled_job_runs` limit 20 | 0,211 s |
| **`admin_marketplace_overview`** (21 subquery) | 0,18–0,30 s |
| **`admin_list_stores`** (3 LATERAL join) | 0,21–0,29 s |

RPC terberat pun di bawah 300 ms, dan angka itu **didominasi round-trip jaringan**
ke region `ap-southeast-1`, bukan waktu eksekusi query. Bukti: query sederhana
(`orders` limit 15) butuh 0,214 s — hampir sama dengan RPC 21 subquery. Kalau query
yang jadi masalah, selisihnya akan jauh lebih besar.

**Yang benar-benar perlu diperhatikan (bukan performa):**

1. **`scheduled_job_runs` tanpa retensi** — 4.879 baris dalam 22 hari (~222/hari).
   Setahun ≈ 81.000 baris. Belum masalah sekarang, tapi tidak ada mekanisme pembersihan.
2. **29 kolom foreign key tanpa index pendukung** — belum berdampak pada data kecil,
   tapi akan memperlambat join dan `ON DELETE` saat data tumbuh.
3. **`audit_logs` tanpa retensi** — 182 baris/22 hari, tapi ini tabel audit; retensi
   harus mengikuti kebutuhan kepatuhan, bukan performa.
4. **3 index duplikat** — pemborosan tulis, bukan baca.

**Keterbatasan bukti (jujur):**

- **Tidak ada akses `EXPLAIN`.** Docker tidak tersedia, `psql` tidak terpasang, dan
  PostgREST tidak mengekspos `pg_stat_statements`. Semua analisis query plan
  **belum terverifikasi**.
- **Tidak ada metrik server** (CPU, RAM, connection count, cache hit ratio). Tidak
  dapat diakses dari luar dashboard Supabase.
- Latency di atas diukur dari mesin lokal, **bukan dari runtime aplikasi**.

---

## B. Database Architecture Map

```
Browser
  │
  ├─ TanStack Query (cache klien, staleTime per query)
  │
  ├─ TanStack Start SSR
  │     └─ server functions (241)
  │           │
  │           ├─ @supabase/supabase-js  ──┐
  │           │   (PostgREST + RLS)       │  satu jalur koneksi
  │           └─ createPublicClient       │  (tidak ada pg.Pool sendiri)
  │                                       │
  └─ Realtime (websocket) ────────────────┤
                                          ▼
                              Supabase PostgREST / GoTrue / Realtime
                                          │
                                          ▼
                                   PostgreSQL 15+
                                   ├─ 56 tabel
                                   ├─ 87 index
                                   ├─ 158 RLS policy
                                   ├─ ~90 RPC (SECURITY DEFINER)
                                   └─ 3 cron job
```

**Poin arsitektur penting:**

| Aspek | Kondisi | Bukti |
|---|---|---|
| Jalur koneksi | **Hanya PostgREST**. Tidak ada `pg.Pool`, tidak ada koneksi langsung | `grep "pg.Pool\|postgres://"` di `src/lib/*.server.ts` → kosong |
| Connection pooling | Ditangani Supabase (PgBouncer di sisi platform) | Tidak ada pool aplikasi |
| RLS | 158 policy, sebagian memanggil `my_store_id()` / `has_permission()` | `20260930100013`, `20261002100001` |
| RPC | `SECURITY DEFINER` dengan guard eksplisit | 90+ fungsi |
| Cron | 3 job: `expire_orders` (10 mnt), `flag_overdue_tasks` (1 jam), `check_sla_breach` (30 mnt) | `20260930100006` |

---

## C. Performance Findings Matrix

### DB-PERF-001 — 29 foreign key tanpa index pendukung

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Domain** | Lintas domain (commerce, fulfillment, marketplace) |
| **Affected** | Join dan `ON DELETE` pada kolom FK |
| **Evidence** | Analisis migrasi: 30 kolom FK tidak punya index yang dimulai dengan kolom tersebut. Contoh paling relevan: `digital_entitlements.order_id`, `digital_entitlements.product_id`, `order_items.product_id`, `refunds.payment_id`, `marketplace_service_orders.order_id` |
| **Root cause** | Index dibuat untuk pola baca yang diketahui saat fitur dibangun, bukan untuk semua FK |
| **Business impact** | **Belum ada** pada data sekarang (≤14 baris). Akan muncul saat `order_items` dan `digital_entitlements` mencapai puluhan ribu baris: join per order jadi seq scan, dan `DELETE` pada parent memicu scan penuh |
| **Recommendation** | Tambah index hanya pada FK yang benar-benar dipakai join. Prioritas: `digital_entitlements(order_id)`, `order_items(product_id)`, `refunds(payment_id)`, `marketplace_service_orders(order_id)` |
| **Trade-off** | +4 index = ~4 write overhead per insert. Pada volume sekarang tidak terasa. |
| **Verification** | **Partially verified** — daftar FK terverifikasi dari migrasi; dampak performa **belum diukur** (butuh `EXPLAIN` dengan data sintetis) |

### DB-PERF-002 — `scheduled_job_runs` tumbuh tanpa retensi

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Domain** | Operasional |
| **Affected** | Tabel `scheduled_job_runs`, query monitoring job |
| **Evidence** | 4.879 baris, rentang 2026-09-30 → 2026-10-22 (22 hari) = **~222 baris/hari**. Distribusi: `expire_orders` 669, `check_sla_breach` 217, `flag_overdue_tasks` 114 (dari sampel 1.000). Index: `(job_name, started_at DESC)` |
| **Root cause** | Tidak ada `DELETE`/retensi untuk tabel ini. Berbeda dari `analytics_events` yang punya `purge_analytics_events(90)` |
| **Business impact** | Setahun ≈ 81.000 baris. Belum berdampak pada query (index sudah tepat), tetapi menambah storage dan memperlambat query "riwayat job" yang memindai rentang panjang |
| **Recommendation** | Tambah job retensi: hapus `scheduled_job_runs` lebih dari 30–90 hari. Ikuti pola `purge_analytics_events` yang sudah ada |
| **Trade-off** | Menghilangkan riwayat job lama. Perlu keputusan berapa lama riwayat operasional disimpan |
| **Verification** | **Verified** (laju pertumbuhan terukur dari data) |

### DB-PERF-003 — 3 index duplikat

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Domain** | Katalog, marketplace |
| **Evidence** | `digital_product_files(product_id)` duplikat; `product_stock_codes(product_id, code)` duplikat; `stores(owner_id)` duplikat (`stores_owner_unique` muncul dua kali di migrasi) |
| **Root cause** | Migrasi berbeda membuat index yang sama tanpa mengecek yang sudah ada |
| **Business impact** | Write amplification kecil: setiap INSERT/UPDATE memperbarui index yang sama dua kali |
| **Recommendation** | Drop index duplikat. Pastikan yang dipertahankan adalah versi dengan constraint (UNIQUE) bila ada |
| **Trade-off** | Sangat rendah; perlu verifikasi bahwa index yang di-drop memang tidak dipakai constraint |
| **Verification** | **Verified** (dari definisi migrasi), **belum diverifikasi di DB aktual** (butuh `pg_indexes`) |

### DB-PERF-004 — `admin_marketplace_overview` memakai 21 subquery terpisah

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Domain** | Laporan admin |
| **Affected** | `admin_marketplace_overview()` |
| **Evidence** | 21 `SELECT` di dalam satu `jsonb_build_object`. Scan berulang: `stores` 5×, `seller_ledger` 5×, `digital_products` 4×, `refunds` 2×, `product_reviews` 2×, `order_items` 2× |
| **Root cause** | Dibangun sebagai kumpulan subquery independen, bukan agregasi tunggal |
| **Business impact** | **Terukur: 0,18–0,30 s** pada data sekarang. Sebagian besar adalah network. Dengan data besar, 5 scan `stores` dan 5 scan `seller_ledger` akan jadi 5× pekerjaan yang sama |
| **Recommendation** | Gabungkan subquery per tabel menjadi satu agregasi `FILTER` (mis. satu scan `stores` dengan `COUNT(*) FILTER (WHERE status='active')`) |
| **Trade-off** | Query lebih sulit dibaca; risiko regresi logika hitung |
| **Verification** | **Verified** (struktur + latency terukur), **belum di-EXPLAIN** |

### DB-PERF-005 — Pagination berbasis `OFFSET` pada halaman admin

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Domain** | Admin (orders, payments, refunds, tasks, users, articles, marketplace services) |
| **Affected** | `.range(from, from + PAGE - 1)` di 8 lokasi |
| **Evidence** | `admin-transaction.functions.ts` (4×), `admin.functions.ts` (4×), `articles.functions.ts`, `marketplace-service-catalog.server.ts` |
| **Root cause** | Offset pagination sederhana |
| **Business impact** | `OFFSET 10000` memaksa PostgreSQL memindai dan membuang 10.000 baris. Pada halaman admin dengan data besar, halaman akhir akan lambat. **Saat ini tidak terasa** (≤182 baris per tabel) |
| **Recommendation** | Tidak perlu diubah sekarang. Bila tabel order melewati ~50.000 baris, pertimbangkan keyset pagination (`WHERE created_at < $cursor ORDER BY created_at DESC LIMIT n`) |
| **Trade-off** | Keyset tidak mendukung lompat ke halaman arbitrer |
| **Verification** | **Verified** (kode), dampak **Not Verified** (data terlalu kecil) |

### DB-PERF-006 — `SELECT *` pada 9 query admin

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Domain** | Admin |
| **Affected** | `admin.functions.ts` baris 209, 348, 428, 527, 600, 632, 637, 712, 781 |
| **Evidence** | `.select("*")` pada tabel dengan hingga 52 kolom (`service_order_details`) |
| **Root cause** | Query generik untuk halaman admin |
| **Business impact** | Transfer kolom yang tidak dipakai. Pada `service_order_details` (52 kolom), ini bisa 3–5× lebih banyak data dari yang dibutuhkan |
| **Recommendation** | Ganti dengan daftar kolom eksplisit sesuai kebutuhan UI |
| **Trade-off** | Perlu penyesuaian tipe; risiko field hilang bila UI butuh kolom tak terduga |
| **Verification** | **Verified** (kode), dampak **belum diukur** |

---

## D. Index & Query Optimization Matrix

| Query prioritas | Index digunakan | Masalah | Rekomendasi | Cara uji |
|---|---|---|---|---|
| Homepage produk (`status='published'`) | `idx_digital_products_status` | Tidak ada | — | `EXPLAIN` sebelum/sesudah bila index diubah |
| Produk per toko | `idx_digital_products_store` | Tidak ada | — | idem |
| Order per user | `idx_orders_user_status (user_id, status)` | Tidak ada | — | idem |
| Order per toko (seller) | `idx_order_items_store` | `order_items.product_id` tanpa index | Tambah index bila join produk sering | `EXPLAIN` pada join `order_items`×`digital_products` |
| Entitlement per order | **Tidak ada** pada `order_id` | Seq scan saat data besar | `CREATE INDEX ON digital_entitlements(order_id)` | `EXPLAIN` cek akses pembeli |
| Ledger seller | `idx_seller_ledger_store (store_id, created_at DESC)` | Tidak ada | — | idem |
| Saldo seller | Index di atas + agregasi | Agregasi penuh per toko | Tidak perlu selama baris per toko kecil | Ukur bila >10.000 baris/toko |
| Refund per payment | **Tidak ada** pada `payment_id` | Seq scan | Tambah index | idem |
| Notifikasi unread | `idx_notifications_recipient (recipient_id, read_at, created_at DESC)` | Tidak ada | — | idem |
| Job monitoring | `idx_scheduled_job_runs_name_time` | Tanpa retensi | Retensi 30–90 hari | Ukur pertumbuhan |

**Catatan penting:** tabel `analytics_events` (608 baris) punya 3 index yang tepat
(`created_at`, `event_type+created_at`, `user_id+created_at`) dan retensi 90 hari —
ini contoh implementasi yang sudah benar di proyek ini.

---

## E. Scaling Readiness Assessment

| Dimensi | Kesiapan | Dasar |
|---|---|---|
| **Pembacaan katalog** | ✅ Siap | 3 produk; index status/store ada; cache TanStack Query |
| **Penulisan transaksi** | ✅ Siap | 14 order; locking benar (`FOR UPDATE`, advisory lock, `SKIP LOCKED`) |
| **Transaksi paralel** | ✅ Siap (desain) | 30+ titik locking di 10 migrasi; idempotency via unique key |
| **Volume data** | ⚠️ Perlu retensi | `scheduled_job_runs` tumbuh tanpa batas |
| **Koneksi** | ✅ Siap | Tidak ada pool aplikasi; PostgREST menangani |
| **Observability** | ❌ **Terbatas** | Tidak ada akses `pg_stat_statements`, tidak ada metrik server dari kode |
| **Recovery** | ❓ **Tidak terverifikasi** | Tidak ada dokumentasi backup/restore teruji di repo |

**Kapasitas terukur:** tidak ada. Semua angka di atas adalah volume saat ini, bukan
proyeksi. Tidak ada load test yang dijalankan (dan memang tidak diizinkan pada production).

---

## F. Prioritized Remediation Roadmap

### P0 — Integritas transaksi
**Tidak ada temuan P0.** Kontrol transaksi sudah benar: idempotency, `FOR UPDATE`,
advisory lock, `SKIP LOCKED`. Diuji pada audit sebelumnya dan lulus.

### P1 — Optimasi terukur

| # | Perbaikan | Bukti | Risiko | Validasi |
|---|---|---|---|---|
| P1-1 | Retensi `scheduled_job_runs` (30–90 hari) | 4.879 baris/22 hari | Kehilangan riwayat job lama | Bandingkan count sebelum/sesudah job retensi |
| P1-2 | Index untuk 4 FK yang paling sering di-join | 29 FK tanpa index | Write overhead kecil | `EXPLAIN` join sebelum/sesudah |
| P1-3 | Hapus 3 index duplikat | Definisi migrasi | Rendah | `pg_indexes` sebelum/sesudah |

### P2 — Kualitas & kesiapan jangka panjang

| # | Perbaikan | Alasan |
|---|---|---|
| P2-1 | Konsolidasi `admin_marketplace_overview` jadi agregasi tunggal | 5× scan tabel sama |
| P2-2 | Ganti `SELECT *` di 9 query admin | Hingga 52 kolom |
| P2-3 | Dokumentasikan backup/restore + uji restore | Tidak ada bukti di repo |
| P2-4 | Aktifkan monitoring slow query di dashboard Supabase | Tidak dapat diakses dari kode |

### Kapan scaling benar-benar diperlukan

Berdasarkan pola saat ini, **belum bisa ditentukan** — tidak ada data beban. Pemicu
yang masuk akal untuk diukur nanti:

| Level | Pemicu (harus diukur, bukan ditebak) |
|---|---|
| Query/index | p95 latency > 500 ms pada query katalog/checkout |
| Connection | error "too many connections" atau pool wait > 100 ms |
| Vertical scaling | CPU > 70% sustained, atau RAM > 80% |
| Read replica | Read IOPS jadi bottleneck dan replica lag < 1 s dapat ditoleransi |
| Partitioning | Tabel log > 50 juta baris dengan query berbasis waktu |

---

## G. Batasan Audit (yang belum terverifikasi)

| Item | Alasan | Bukti minimum yang dibutuhkan |
|---|---|---|
| **Execution plan (`EXPLAIN`)** | Docker tidak tersedia, `psql` tidak terpasang, `pg_stat_statements` tidak terekspos PostgREST | Akses SQL langsung atau Supabase Dashboard → Query Performance |
| **Metrik server** (CPU, RAM, IOPS, cache hit) | Hanya di dashboard Supabase | Screenshot/ekspor metrik |
| **Connection count & wait** | idem | `pg_stat_activity` |
| **Table bloat / autovacuum** | idem | `pg_stat_user_tables` |
| **Index usage** (mana yang tidak pernah dipakai) | idem | `pg_stat_user_indexes` |
| **Backup & restore** | Tidak ada dokumentasi di repo | Prosedur + hasil uji restore |
| **Load test** | Tidak dijalankan (dilarang di production) | Test plan di lingkungan terisolasi |
| **RLS cost terhadap plan** | Butuh `EXPLAIN` | idem |

**Yang terverifikasi:** struktur schema (56 tabel, 87 index, 158 policy, ~90 RPC),
volume data aktual, laju pertumbuhan log, pola locking, pola query (N+1, `SELECT *`,
offset pagination), latensi empiris RPC terberat, dan daftar FK tanpa index.

---

## H. Catatan Metodologi

1. **Schema** dibaca dari 118 file migrasi + OpenAPI PostgREST (57 definitions).
2. **Volume data** diukur via `Prefer: count=exact` pada 18 tabel.
3. **Latency** diukur 3× per endpoint dari mesin audit, **bukan dari server aplikasi**.
4. **Pola query** diekstrak dengan pencarian statis pada `src/lib/*.ts`.
5. **Index** diekstrak dari `CREATE INDEX` di migrasi, lalu dibandingkan dengan daftar FK.
6. **Tidak ada** `EXPLAIN`, tidak ada metrik server, tidak ada load test.
