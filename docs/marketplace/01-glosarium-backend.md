# Glosarium Backend — Ebrystore

Disusun dari analisis langsung kode & migrasi Ebrystore (2026-09-30).
Tujuan: kosakata bersama agar diskusi teknis tidak ambigu.

---

## 1. Istilah Skala & Performa

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **Load** | Beban kerja server (jumlah request/proses per waktu) | 1000 user buka `/produk` bersamaan |
| **Bottleneck** | Titik tersempit yang membatasi kecepatan | Search `ILIKE %...%` |
| **Latency** | Waktu tunggu satu request (ms) | Query produk ambil 120ms |
| **Throughput** | Banyak request yang bisa dilayani per detik | 50 req/detik |
| **Concurrency** | Banyak proses berjalan bersamaan | 200 user checkout serentak |
| **N+1 Query** | 1 query utama + N query tambahan (pemborosan) | Ambil 20 order, lalu query item satu per satu |
| **Full Table Scan** | Baca seluruh tabel (lambat di data besar) | `ILIKE '%kata%'` tanpa index |
| **Index** | Struktur percepat pencarian (seperti daftar isi buku) | `idx_orders_user_status` |
| **Caching** | Simpan hasil agar tidak hitung ulang | React Query `staleTime: 60s` |
| **CDN** | Jaringan server tersebar untuk kirim file/gambar | Cloudflare |
| **Rate Limiting** | Batas jumlah request per user/waktu | Max 5 login/menit ❌ belum ada |
| **Horizonal Scaling** | Tambah server (banyak mesin) | — |
| **Vertical Scaling** | Perbesar 1 server (RAM/CPU lebih besar) | Upgrade Supabase Pro |
| **Pooling** | Pakai ulang koneksi DB agar tidak buka-tutup terus | Supabase pooler (port 6543) |
| **Timeout** | Batas waktu sebelum operasi dibatalkan | Query > 30s dihentikan |
| **Connection Limit** | Maksimal koneksi DB bersamaan | Supabase Free = 60 |

---

## 2. Istilah Database (PostgreSQL/Supabase)

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **Schema** | Struktur/blueprint database | 41 tabel di schema `public` |
| **Table** | Tabel (kumpulan baris) | `orders`, `digital_products` |
| **Row/Record** | Satu baris data | 1 order |
| **Column/Field** | Kolom | `order_number`, `total` |
| **Primary Key (PK)** | Identitas unik tiap baris | `id uuid` |
| **Foreign Key (FK)** | Penghubung antar tabel | `orders.user_id → profiles.id` |
| **Constraint** | Aturan yang wajib dipatuhi data | `CHECK (status IN (...))` |
| **Unique Constraint** | Tidak boleh ada nilai kembar | `orders.order_number` |
| **Index** | Percepat pencarian | 54 index di Ebrystore |
| **Partial Index** | Index hanya untuk baris tertentu | `WHERE deleted_at IS NULL` |
| **Composite Index** | Index gabungan beberapa kolom | `(user_id, status)` |
| **View** | Tabel virtual dari query | Belum dipakai |
| **Migration** | File perubahan struktur DB (versi) | 43 file di `supabase/migrations/` |
| **Rollback** | Batalkan perubahan | Belum ada (semua aditif) |
| **Seed Data** | Data awal bawaan | 43 permission, 13 kategori |
| **Soft Delete** | "Hapus" dengan isi `deleted_at` (data tetap ada) | `digital_products.deleted_at` |
| **Snapshot** | Salinan nilai saat transaksi (agar history utuh) | `order_items.name_snapshot` |
| **Normalization** | Susun data agar tidak duplikat | Tabel terpisah per domain |
| **Denormalization** | Duplikasi sengaja untuk kecepatan | `name_snapshot` di order_items |

---

## 3. Istilah Keamanan & Akses

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **RLS (Row Level Security)** | Aturan akses per-baris di database | 41 tabel ber-RLS |
| **Policy** | Aturan RLS konkret | `orders_select_own` |
| **GRANT / REVOKE** | Beri/cabut izin akses | `REVOKE ... FROM anon` |
| **Role** | Peran user | customer, seller, admin, super_admin |
| **Permission** | Izin spesifik | `orders.view`, `payments.verify` |
| **RBAC** | Kontrol akses berbasis peran | 31+ permission × 6 role |
| **AuthN (Authentication)** | "Siapa kamu?" (login) | Supabase Auth |
| **AuthZ (Authorization)** | "Boleh apa kamu?" (izin) | `assertPermission()` |
| **JWT** | Token identitas login | Bearer token di header |
| **anon** | Peran user belum login | Baca katalog publik |
| **authenticated** | Peran user sudah login | Baca order sendiri |
| **service_role** | Peran super (bypass RLS) | Dipakai server saja |
| **SECURITY DEFINER** | Fungsi jalan dengan hak pembuatnya (bukan pemanggil) | 67 pemakaian RPC |
| **search_path** | Urutan pencarian schema (anti-hijack) | `SET search_path = public` |
| **IDOR** | Celah akses data milik orang lain | Dilindungi RLS + cek ownership |
| **Audit Log** | Catatan siapa melakukan apa | Tabel `audit_logs` |
| **Signed URL** | Link sementara terbatas waktu | Unduhan produk 5 menit |
| **Bucket** | Wadah file di storage | 6 bucket privat |
| **Secret** | Kunci rahasia | `SUPABASE_SERVICE_ROLE_KEY` |
| **Encryption** | Enkripsi data | Bawaan Supabase |
| **Hashing** | Ubah data jadi kode satu arah (password) | Bawaan Supabase Auth |
| **Injection** | Serangan sisipkan kode jahat | Dicegah parameterized query |
| **XSS** | Serangan sisip script di halaman | Dicegah sanitasi |
| **CSRF** | Serangan paksa aksi tanpa sadar | Middleware CSRF |
| **Rate Limit** | Batas request (anti brute force) | ❌ belum ada |

---

## 4. Istilah Transaksi & Uang

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **Transaction (DB)** | Sekumpulan operasi: sukses semua atau batal semua | RPC pakai transaksi implisit |
| **Commit / Rollback** | Simpan / batalkan transaksi | — |
| **ACID** | Atomic, Consistent, Isolated, Durable | Jaminan Postgres |
| **Lock** | Kunci baris agar tidak bentrok | `FOR UPDATE` (47 pemakaian) |
| **FOR UPDATE SKIP LOCKED** | Ambil baris bebas, lewati yang terkunci | Assign file unik |
| **Race Condition** | Dua proses balapan → hasil salah | Rebutan stok |
| **Idempotency** | Operasi sama 2× = hasil sama (tidak ganda) | `idempotency_key` (13 pemakaian) |
| **ON CONFLICT** | Tangani duplikat (39 pemakaian) | `ON CONFLICT (order_item_id) DO NOTHING` |
| **Deadlock** | Dua proses saling tunggu → macet | Dicegah urutan lock konsisten |
| **Ledger** | Buku besar catatan uang (append-only) | Belum ada (marketplace) |
| **Settlement** | Penyelesaian dana | — |
| **Hold Balance** | Saldo ditahan sementara | Belum ada |
| **Available Balance** | Saldo bisa dipakai | Belum ada |
| **Payout** | Pencairan dana ke penjual | Belum ada |
| **Escrow** | Rekening penampung pihak ketiga | ⚠️ Jangan sebut tanpa dasar legal |
| **Reconciliation** | Cocokkan catatan uang dengan kenyataan | Sebagian ada |
| **Refund** | Pengembalian dana | Sudah ada (⚠️ rusak: `actor_type`) |
| **Commission / Fee** | Potongan platform | Belum ada (marketplace) |

---

## 5. Istilah API & Komunikasi

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **API** | Antarmuka komunikasi antar sistem | — |
| **Endpoint** | URL sasaran request | `/api/public/payments/webhook/sumopod` |
| **Server Function** | Fungsi server bertipe (pengganti API) | 61 di Ebrystore |
| **RPC** | Remote Procedure Call — fungsi di DB | 63 fungsi |
| **Request / Response** | Permintaan / jawaban | — |
| **Payload** | Isi data yang dikirim | Body JSON |
| **Header** | Metadata request | `Authorization: Bearer ...` |
| **Webhook** | Pemberitahuan otomatis dari layanan luar | SumoPod payment |
| **REST** | Gaya API berbasis method HTTP | Supabase REST |
| **Validation** | Cek input sebelum diproses | Zod di setiap boundary |
| **Middleware** | Penengah sebelum handler | auth, CSRF, error |
| **CRUD** | Create, Read, Update, Delete | Produk admin |
| **Pagination** | Bagi data jadi halaman | `range()` max 48 |
| **Filter / Sort** | Saring / urutkan | Filter status pesanan |
| **Query Param** | Parameter di URL | `?filter=unpaid` |
| **Serialization** | Ubah objek ↔ format kirim (JSON) | — |
| **Error Handling** | Cara tangani kesalahan | `{ code, message }` |

---

## 6. Istilah Alur & Logika Bisnis

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **State Machine** | Aturan perpindahan status | Order: 16 status |
| **Transition** | Perpindahan status | `awaiting_payment → paid` |
| **Guard** | Syarat sebelum transisi | Cek permission + status |
| **Domain Event** | Kejadian bermakna bisnis | `order.paid` |
| **Side Effect** | Efek samping suatu aksi | Kirim notifikasi, buat entitlement |
| **Idempotent** | Aman dijalankan berulang | Verifikasi pembayaran |
| **Workflow** | Rangkaian langkah berurutan | Fulfillment jasa |
| **Adapter** | Penerjemah ke layanan luar | Payment adapter (SumoPod) |
| **Orchestration** | Pengaturan banyak proses | Task engine |
| **Business Rule** | Aturan bisnis | BR-01: harga server-side |
| **Invariant** | Kebenaran yang tak boleh dilanggar | Uang server-authoritative |

---

## 7. Istilah Latar Belakang & Otomatisasi

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **Cron** | Penjadwal tugas berkala | `pg_cron` ⚠️ belum dijadwalkan |
| **Job / Task** | Tugas otomatis | `job_expire_orders` |
| **Queue** | Antrean tugas | Belum ada |
| **Worker** | Proses yang jalankan queue | Belum ada |
| **Scheduler** | Pengatur jadwal | ❌ mati |
| **Trigger** | Fungsi otomatis saat data berubah | 36 trigger |
| **Cascade** | Efek berantai | Hapus user → hapus profil |
| **Batch** | Proses sekelompok sekaligus | Update massal |

---

## 8. Istilah Realtime

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **Realtime** | Update langsung tanpa reload | Notifikasi muncul otomatis |
| **Channel** | Jalur langganan data | `use-realtime-refresh` |
| **Subscription** | Langganan perubahan | 21 halaman |
| **Publication** | Daftar tabel yang disiarkan | 16 tabel |
| **REPLICA IDENTITY** | Data apa yang dikirim saat berubah | `FULL` |
| **Polling** | Cek berkala (alternatif realtime) | QRIS cek 8 detik |

---

## 9. Istilah Pengembangan & Rilis

| Istilah | Arti | Contoh di Ebrystore |
|---|---|---|
| **Dev / Staging / Production** | Lingkungan: uji / pra-produksi / nyata | Preview vs live |
| **Deployment** | Proses pasang ke server | Vercel/VPS |
| **CI/CD** | Otomatisasi test & deploy | ❌ belum ada |
| **Environment Variable** | Konfigurasi per lingkungan | `.env` |
| **Build** | Ubah kode → versi produksi | `vite build` |
| **Bundle** | Kumpulan file siap kirim ke browser | Belum diukur |
| **Linter** | Cek gaya kode | ESLint |
| **Type Checking** | Cek tipe TypeScript | `tsc --noEmit` |
| **Unit Test** | Uji 1 bagian kecil | 2 file |
| **Integration Test** | Uji beberapa bagian bersama | ❌ |
| **E2E Test** | Uji alur penuh dari UI | 6 spec |
| **Smoke Test** | Uji cepat fungsi inti | — |
| **Regression Test** | Pastikan fitur lama tak rusak | 1 file |
| **Load Test** | Uji ketahanan saat dibebani | ❌ belum |
| **Monitoring** | Pantau kesehatan sistem | ❌ minim |
| **Alerting** | Pemberitahuan saat ada masalah | ❌ |
| **Observability** | Kemampuan "melihat" isi sistem | Log dasar |
| **Runbook** | Panduan operasional saat insiden | ❌ |
| **Backup** | Salinan cadangan | ❌ belum diuji |
| **Disaster Recovery** | Pemulihan setelah bencana | ❌ |
| **RPO / RTO** | Target kehilangan data / waktu pulih | Target: 24j / 4j |

---

## 10. Istilah Khusus Ebrystore (domain)

| Istilah | Arti |
|---|---|
| **Order** | Pesanan |
| **Entitlement** | Hak unduh produk digital |
| **Delivery Mode** | Cara kirim produk: `shared` / `unique` / `code` |
| **Stock Code** | Kode/link redeem (mode `code`) |
| **Fulfillment** | Proses pengerjaan (jasa) |
| **Assignment** | Penugasan order ke operator |
| **Revision** | Permintaan revisi hasil kerja |
| **Dispute** | Sengketa |
| **Admin Task** | Tugas operasional internal |
| **Inquiry** | Tanya-jawab pembeli-produk |
| **PO (Purchase Order)** | Pesanan custom |

---

## Ringkasan: Semua Istilah Penting (selain "scale")

```
PERFORMA    : load, bottleneck, latency, throughput, concurrency, N+1, cache, rate limit
DATABASE    : schema, migration, index, constraint, trigger, snapshot, soft delete
KEAMANAN    : RLS, policy, RBAC, permission, JWT, SECURITY DEFINER, IDOR, signed URL
TRANSAKSI   : transaction, lock, race condition, idempotency, ON CONFLICT, ledger, payout
API         : endpoint, server function, RPC, webhook, payload, validation, pagination
ALUR        : state machine, transition, guard, domain event, side effect, adapter
OTOMATIS    : cron, job, queue, worker, scheduler, trigger
REALTIME    : channel, subscription, publication, polling
RILIS       : deployment, CI/CD, staging, production, backup, rollback, monitoring
```
