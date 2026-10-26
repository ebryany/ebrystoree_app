# MGRCAO V3: realtime dan timeline pesanan jasa seller

Tanggal: 2026-10-03. Dasar: [riset realtime dan timeline jasa](../ui-ux/2026-10-03-riset-realtime-timeline-jasa-seller.md). Status: framework untuk pekerjaan berikutnya; belum dieksekusi dan bukan otorisasi implementasi. Tidak ada agent, dependency baru, atau deployment pada tahap ini.

## M: Mindset

Realtime di aplikasi ini berarti Supabase `postgres_changes` yang memicu `invalidateQueries` React Query, bukan lapisan state baru. Tabel harus terdaftar di publication `supabase_realtime`, dan RLS tetap menjadi batas: subscriber hanya menerima baris yang boleh dibacanya.

Timeline jasa bukan timeline generik. Sumber kebenaran pengerjaan adalah `marketplace_service_events` dan `work_state`, bukan `order_status_histories` pembayaran. Satu halaman buyer harus punya satu garis waktu yang jujur: pembayaran dan pengerjaan dalam satu alur, bukan dua panel yang saling bertentangan.

Unggah berkas hasil bukan sekadar tombol. Tanpa keputusan retensi dan policy penyimpanan (JDO-07), artifact tetap ditutup. Riset mencatat syaratnya; keputusan tetap milik owner.

## G: Goal

1. Realtime jasa benar-benar menyala: perubahan `work_state`, delivery, revisi, acceptance, dan komplain tersiar ke buyer dan seller tanpa refresh, dengan tabel yang tepat dan sadar-RLS.
2. Satu timeline jasa yang benar: tahap pembayaran digabung dengan tahap pengerjaan (`awaiting_requirements` sampai `accepted`), plus feed event jasa yang sudah ada.
3. Status pengerjaan terbaca di semua permukaan: kartu daftar seller, panel buyer, dan timeline besar, memakai label `marketplaceServiceWorkStateLabels` yang sama.
4. Buyer dan seller menerima sinyal aksi yang jelas: apa yang sedang terjadi, apa yang menunggu siapa, dan apa langkah berikutnya.
5. Temuan konsistensi dibenahi: nama snapshot pada RPC seller, ikon tipe pesanan, empty state usang, invalidasi daftar seller, dan indikator status koneksi realtime.
6. Pengiriman hasil memakai berkas: diputuskan dan, bila disetujui, diimplementasikan dengan bucket privat, policy, kolom, dan signed URL, bukan hanya input file di UI.
7. Tidak ada regresi pada realtime existing: chat, notifikasi, admin, dan halaman lain tetap bekerja dengan hook yang sama.
8. Pengujian unit atas kontrak publikasi, timeline jasa, dan schema baru, serta kejujuran batas verifikasi (static assertion bukan bukti websocket live).

## R: Role

Bertindak sebagai Engineer Spesialis Realtime Marketplace dan Frontend/UI/UX Specialist untuk alur jasa seller, bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- Migration baru: publication membership untuk tabel jasa, dan (bila disetujui) bucket/policy/kolom artifact.
- `src/hooks/use-realtime-refresh.ts` hanya bila perlu perubahan backward compatible.
- `src/components/ebry/live-timeline.tsx`, `src/components/ebry/marketplace-service-order.tsx`, `src/routes/_authenticated/seller.jasa-pesanan.tsx`, `src/routes/_authenticated/dashboard.pesanan.$id.tsx`, `src/routes/_authenticated/dashboard.pesanan.index.tsx`.
- `src/lib/marketplace-service.functions.ts` dan `src/lib/marketplace-service.ts` untuk penyesuaian DTO/schema.
- RPC `list_my_service_orders` dan `get_my_service_order` lewat migration baru (bukan mengedit migration yang sudah diterapkan).
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak ada provider realtime baru, tidak ada event bus, tidak ada chat engine, tidak ada perubahan jalur uang.

## C: Constraints

- Jangan mengedit migration yang sudah diterapkan (`20261003110000`, `20261003120000`, `20261003140000`). Perbaikan SQL selalu lewat migration baru.
- Publication membership harus idempoten dengan guard `pg_publication_tables`, mengikuti pola `20261003131000_chat_realtime_publication.sql`.
- RLS tidak boleh dilonggarkan hanya demi realtime. Seller tetap tidak boleh membaca `orders` toko lewat jalur baru; gunakan tabel jasa atau `notifications`.
- Tidak ada `REPLICA IDENTITY` yang mengubah payload secara sembarangan; nilai default aman untuk kebutuhan invalidate (bukan membaca payload penuh).
- Artifact upload tetap tertutup sampai keputusan retensi/privasi (JDO-07) disetujui owner. Framework ini menyiapkan jalannya, bukan mengaktifkannya diam-diam.
- Timeline jasa harus membaca `marketplace_service_events` sebagai sumber, tidak menduplikasi event.
- Tidak menambah dependency. Tidak menyentuh `src/integrations/supabase/types.ts` yang digenerate.
- Token, kredensial, dan data pelanggan nyata tidak boleh muncul di log atau dokumen.
- Pengujian finansial/lifecycle tetap memakai fixture rollback, bukan transaksi nyata.
- Setiap klaim realtime di evidence harus dibedakan: kontrak statis vs websocket live yang benar-benar diuji.

## A: Actions

1. Migration publication: tambahkan `marketplace_service_orders`, `marketplace_service_deliveries`, dan `marketplace_service_events` ke `supabase_realtime` dengan guard idempoten. Verifikasi read-only keanggotaan lewat helper yang ada.
2. Timeline jasa: definisikan tahap jasa yang menggabungkan pembayaran (`awaiting_payment`, `payment_under_review`, `paid`) dengan pengerjaan (`awaiting_requirements`, `in_progress`, `delivered`, `revision_requested`, `accepted`), dengan pemetaan `work_state` + `order.status` yang eksplisit dan sadar komplain/refund.
3. Feed event jasa: alirkan `marketplace_service_events` ke timeline buyer dengan label yang sudah ada (`eventLabels`) dan `actor_role`; hilangkan kebingungan dua timeline.
4. Realtime buyer: tambahkan tabel jasa ke `useRealtimeRefresh` halaman detail pesanan buyer, dan pertahankan polling sebagai jaring pengaman atau hapus bila realtime terbukti.
5. Realtime seller: pastikan hook seller memantau tabel jasa yang kini terdaftar; tambahkan invalidasi key daftar `my-service-orders` setelah aksi seller.
6. Konsistensi RPC seller: ubah `list_my_service_orders` dan `get_my_service_order` memakai `name_snapshot` dari `order_items` (atau sumber snapshot yang benar), lewat migration baru.
7. Konsistensi UI: ikon `marketplace_service` di `dashboard.pesanan.index.tsx`, empty state usang di `seller.jasa-pesanan.tsx`, dan indikator status koneksi realtime yang memakai `realtimeStatusKey` yang sudah ada.
8. Artifact upload (kondisional, menunggu keputusan): bucket privat baru, policy `storage.objects` berbasis pesanan/toko, kolom delivery, signed URL unduhan, dan penyesuaian schema delivery.
9. Tests: kontrak publication (static), pemetaan tahap timeline jasa, feed event jasa, schema artifact bila dikerjakan, dan tidak ada regresi pada test realtime existing.
10. Evidence: klik-through buyer/seller pada pesanan jasa nyata (tanpa membuat transaksi uang), hasil unit/build, hasil migration test/apply/verify, dan batas yang belum diuji.

## O: Acceptance

- Tabel jasa menjadi anggota `supabase_realtime` dan terverifikasi read-only; subscription seller/buyer menerima perubahan tanpa refresh manual.
- Timeline jasa menampilkan pembayaran dan pengerjaan dalam satu alur; `marketplace_service` tidak lagi memakai `DIGITAL_STAGES`.
- `marketplace_service_events` tampil di timeline buyer dengan aktor yang benar; tidak ada timeline ketiga.
- Status `work_state` konsisten di kartu seller, panel buyer, dan timeline.
- RPC seller memakai nama snapshot; mengganti nama listing tidak mengubah riwayat pesanan lama.
- Empty state dan ikon tipe pesanan tidak lagi menyesatkan; indikator status koneksi realtime terlihat bila koneksi bermasalah.
- Artifact upload hanya aktif bila keputusan retensi/privasi disetujui; implementasinya memakai bucket privat, policy ketat, dan signed URL, dengan test yang menolak akses lintas pemilik.
- Tests/build dilaporkan apa adanya; klaim realtime live dibedakan dari static assertion. Tidak ada deployment frontend, commit, push, atau transaksi uang nyata tanpa permintaan eksplisit.
