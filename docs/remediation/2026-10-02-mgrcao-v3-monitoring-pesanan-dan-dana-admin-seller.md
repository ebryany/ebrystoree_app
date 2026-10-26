# MGRCAO V3: monitoring pesanan dan dana admin/seller

Tanggal: 2026-10-02. Dasar: [analisis gap](../audit/2026-10-02-analisis-gap-admin-seller-dan-pengaturan-website.md), MON-01 sampai MON-04. User mengotorisasi langsung menjalankan tahap ini setelah dokumen tersedia.

## M: Mindset

Perbaikan ini read-only terhadap lifecycle transaksi. Membuat status dan dana dapat ditelusuri tanpa mengubah kapan dana dilepas. Pakai source existing dan perubahan minimum. Pisahkan fakta source, hasil pengujian database, serta bagian GUI yang belum diuji. Tidak menganggap completed legacy sebagai acceptance.

## G: Goals

1. Admin melihat readiness, receipt, dan rincian dana seller pada detail order digital.
2. Seller melihat hanya order/item/dana milik tokonya, dengan detail di halaman pesanan existing.
3. Kedua pihak mempunyai daftar delivery blocked, menunggu penerimaan, dan refund aktif, dengan pagination, jumlah menyeluruh, serta umur tunggu.
4. Satu kontrak SQL monitoring menghitung per-order/store held, released, refunded, dan refund reserve dengan aturan existing.
5. Tidak membuka PII buyer, code/path download, internal notes, atau aksi finansial baru.

## R: Role

Engineer utama mengerjakan sendiri. Tidak menjalankan agent, server, atau browser-use. Dokumentasi, SQL security, server function, komponen, dan runnable checks berada dalam satu scope. Inspeksi source sebelum edit dan backup sebelum deployment database.

## C: Context

Receipt dan release migration 20261002120000/20261002130000 telah diterapkan pada pekerjaan sebelumnya. Periksa dependency dan definition sebelum migration monitoring. Readiness dari digital_receipt_items bersifat internal; fungsi itu tidak mengalokasikan stok. get_store_finances mendefinisikan held dari receipt pending dan paid evidence, serta reserve dari remaining released sale pada refund aktif.

Receipt RLS hanya buyer owner. Monitoring admin harus memiliki orders.view di database, bukan SELECT langsung yang diam-diam kosong. Monitoring seller memakai stores.owner_id = auth.uid(), bukan can_access_store yang juga dapat memberi akses staff. Seller scope tetap owner meski user memiliki permission admin.

Admin detail sudah mempunyai getOrderDetail dan seller pesanan belum mempunyai detail route. Gunakan panel disclosure di halaman existing untuk seller; jangan menambah route/menu bila tidak perlu. Daftar monitoring admin diletakkan pada dashboard existing dengan tautan detail order. Detail dan antrean memakai komponen UI/token existing serta DESIGN.md, ENERGY 1 / RHYTHM 2 / MOTION 1. Layout untuk angka dan tindakan; tanpa dekorasi/asset baru.

### Allowlist

- Dokumen analisis/framework/evidence di docs/audit dan docs/remediation.
- Satu migration monitoring baru di supabase/migrations.
- src/lib/order-monitoring.functions.ts dan tipe payload terkait bila diperlukan.
- src/components/ebry/order-monitoring.tsx.
- src/routes/_authenticated/seller.pesanan.tsx.
- src/routes/_authenticated/admin/index.tsx.
- src/routes/_authenticated/admin/orders.$id.tsx.
- Satu test regression dalam src/lib/__tests__.
- Helper, fixture SQL, backup definition, serta log scoped di .zcode.

Perluasan file hanya bila integration nyata menuntutnya, tetap MON-01 sampai MON-04. Hindari generated type/route regeneration yang tidak diperlukan, refactor umum, format massal, atau dependency baru.

## A: Actions

1. Dokumentasikan source dan kontrak, periksa skema order/refund/store/ledger dan readiness existing. Jangan membaca atau mencetak credential.
2. Buat RPC internal read-only untuk projection monitoring; revoke PUBLIC/anon/authenticated. Wrapper detail/list memvalidasi auth, permission/owner, UUID, filter, page, dan scope.
3. Hitung per-order/store:
   - item_total dari snapshot item toko, bukan order total termasuk fee;
   - released_total dari sale credit;
   - refunded_total dari debit refund; remaining sale memperhitungkan reversal;
   - held_receipt dengan predicate get_store_finances existing;
   - refund_reserved = remaining released sale positif ketika refund aktif;
   - release timestamp dan receipt accepted_at terpisah;
   - legacy/no receipt eksplisit; tidak membuat receipt atau ledger.
4. Antrean status berbasis data, bukan status order saja. Refund aktif diprioritaskan; delivery blocked dan awaiting receipt memerlukan paid evidence serta pending receipt. Pagination SQL dan aggregate counts menyeluruh. Umur tunggu berasal dari timestamp server; tidak mengklaim SLA.
5. Hubungkan admin/seller melalui server functions authenticated. Error ditampilkan, bukan fallback finansial nol. Query refetch saat fokus dan tombol refresh.
6. Render detail/pagination/filter menggunakan komponen existing. Semua kontrol memiliki aksi, label, focus; loading/error/empty. Seller melihat readiness saja, bukan secret download atau buyer identity.
7. Jalankan unit/regression/build/lint. Catat baseline typecheck tanpa memperbaiki error unrelated.
8. Preflight linked database, snapshot count/order/ledger dan function dependency/grants. Jalankan SQL migration beserta fixture di BEGIN/ROLLBACK terlebih dahulu. Periksa seller nonowner, anon, permission admin, legacy, receipt pending/accepted, readiness, reserve/refund serta pagination.
9. Terapkan hanya migration monitoring dalam transaksi, dengan migration registry dan timeout. Idempotent helper menolak version existing yang definition-nya berbeda. Postflight definition/grants/dependency serta invariant snapshot, kemudian runtime rollback ulang.
10. Buat evidence. Tidak publish frontend, commit, atau push tanpa instruksi.

### Acceptance checks

| ID | Kasus | Hasil wajib |
|---|---|---|
| T-01 | Tanpa auth | UNAUTHENTICATED/execute denied |
| T-02 | Seller toko lain / seller staff mencoba scope owner | NOT_FOUND atau daftar kosong, tidak bocor data |
| T-03 | Admin tanpa orders.view | FORBIDDEN |
| T-04 | Admin orders.view | Detail semua item/store order yang diminta |
| T-05 | Paid pending, shared/unique/code ready | Held, awaiting_receipt, tanpa sale credit |
| T-06 | File/object/entitlement/code tidak siap | delivery_blocked, ready=false, tanpa secret payload |
| T-07 | Accepted dan sale credit | Receipt/time, released_total, held=0 |
| T-08 | Refund sebelum release | refund_active, held menurut aturan existing, reserve=0, debit seller=0 |
| T-09 | Refund setelah release | reserve remaining sale, bukan seluruh order gross |
| T-10 | Refund selesai | Histori status/nominal, debit hanya jika ada release |
| T-11 | Legacy completed tanpa receipt | Legacy/no receipt, tanpa accepted palsu |
| T-12 | Filter/pagination/total | SQL total bukan jumlah halaman; order deterministik |
| T-13 | Projection per toko | Tidak mencampur dana/item seller lain |
| T-14 | Non-digital | Tidak mengubah jalur service/academic/platform khusus |
| T-15 | Read-only | Order, receipt, ledger tidak berubah setelah query |
| T-16 | RPC error/loading/empty | Error eksplisit; angka bukan nol palsu |

## O: Outputs

- Analisis dan framework tersedia, beserta implementasi MON-01 sampai MON-04.
- Migration additive read-only, komponen monitoring, server function, dan regression check runnable.
- Evidence source/build/database; daftar batas pengujian yang jujur.
- Rollback: lepas konsumsi frontend/server monitoring dahulu, lalu drop wrapper/internal function monitoring jika perlu. Jangan rollback migration rekber sebelumnya atau mengubah order/ledger.
- Pengaturan/laporan/payout/notifikasi/bukti seller baru tetap backlog. Tidak mengubah acceptance/refund/release policy.

## Status

Framework selesai dan langsung dijalankan sesuai otorisasi user. Source MON-01 sampai MON-04 terimplementasi; migration monitoring terdeploy dan runtime rollback/postflight lulus. Rincian hasil dan batas GUI/frontend publish terdapat pada [evidence monitoring](2026-10-02-evidence-monitoring-pesanan-dan-dana-admin-seller.md).
