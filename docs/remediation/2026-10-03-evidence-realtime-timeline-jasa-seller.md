# Bukti realtime, timeline, dan berkas hasil jasa seller

Tanggal: 2026-10-03.

## Hasil implementasi

Realtime pesanan jasa kini benar-benar menyala, timeline pembeli diubah menjadi stepper horizontal kiri ke kanan yang lebar penuh di atas halaman, dan seller dapat mengirim hasil sebagai berkas privat.

Akar masalah yang diperbaiki: tabel jasa tidak pernah terdaftar di publication `supabase_realtime`, sehingga subscription yang sudah terpasang tidak pernah menerima event. Halaman buyer juga tidak memantau tabel jasa, dan timeline besar memakai tahap pesanan digital untuk `marketplace_service`.

## Dokumen sebelum implementasi

- Riset: `docs/ui-ux/2026-10-03-riset-realtime-timeline-jasa-seller.md`.
- Framework: `docs/remediation/2026-10-03-mgrcao-v3-realtime-timeline-jasa-seller.md`.
- Keputusan owner: upload berkas hasil (JDO-07) diaktifkan.

## Migration

| Versi | Isi | Status |
| --- | --- | --- |
| 20261003150000 | Publication realtime 3 tabel jasa + RPC seller pakai nama snapshot | diterapkan, terverifikasi |
| 20261003160000 | Bucket privat `service-deliveries`, kolom artifact, 3 policy storage, RPC delivery berkas | diterapkan, terverifikasi |
| 20261003170000 | Cabut EXECUTE `try_uuid` dari anon | diterapkan, terverifikasi |

Tidak ada migration yang sudah diterapkan yang diedit.

## Verifikasi database

Fixture rollback (`.zcode/jasa-realtime-rollback.sql`) menguji di dalam transaksi lalu `ROLLBACK`:

- Tiga tabel jasa menjadi anggota `supabase_realtime`.
- Bucket privat dengan batas 26214400 byte; policy read tidak terbuka lebar.
- `try_uuid` menolak string cacat, menerima UUID.
- Nama pesanan memakai `name_snapshot`, bukan nama listing terkini (daftar dan detail).
- Delivery berkas menolak path traversal, ukuran melebihi batas, dan berkas yang tidak ada di storage.
- Delivery berkas valid tersimpan dengan metadata, work_state menjadi `delivered`.
- Constraint satu payload per jenis menolak perubahan kind yang tidak konsisten.
- `anon` tidak dapat memanggil RPC delivery berkas.

Hasil: `{"passed":true,...}` di `.zcode/jasa-realtime-db-test.json`, jumlah row finansial tidak berubah.

Verifikasi live (`.zcode/jasa-realtime-db-verify.json`):
`{"verified":true,"publication":3,"bucketPrivate":true,"policies":3,"artifactColumns":4,"anonymousDenied":true}`.

Jumlah row nyata sebelum dan sesudah aktivasi tetap: orders 8, payments 8, seller_ledger 4.

## Verifikasi kode

| Pemeriksaan | Hasil |
| --- | --- |
| Unit test | 24 file, 318 tes lulus |
| Production build | exit 0 |
| Lint file terkait | 0 error, warning `any` existing |
| TypeScript global | 72 error (baseline lama), 0 error pada file yang diubah |

## Verifikasi browser

Akun browser adalah pemilik toko `citra` (bukan pembeli pesanan yang ditampilkan pengguna).

- `/seller/jasa-pesanan`: daftar 4 pesanan, filter tab, detail expand.
- Tombol **Setujui requirements** pada pesanan uji `EBS-20261003-000020` dijalankan; status berubah ke **Sedang dikerjakan** dengan tenggat mulai berjalan. Ini aksi seller normal pada pesanan uji milik toko, bukan keputusan finansial.
- Form **Kirim hasil pekerjaan** menampilkan tiga opsi: Tautan hasil, Catatan hasil, dan **Berkas hasil**.
- Radio **Berkas hasil** menampilkan input berkas dengan `accept` berisi 11 format (PDF, ZIP, teks, gambar, dokumen Office).
- Screenshot: `C:/Users/febry/.zcode/cli/artifacts/sess_e87d96c2-6d11-4323-abad-5d5af9e9a771/call_00_cySwnpLHUKynkR1NYEsg4295-tool-result-5fa66898-f4ec-48c3-9044-beac23e481b4.png`.

## Perubahan UI

- Lini masa dipindah ke **paling atas halaman** dengan **lebar penuh** (keluar dari grid dua kolom).
- Stepper diubah dari vertikal menjadi **horizontal kiri ke kanan**: lingkaran status, garis progres terisi, label di bawah, penanda "Sedang berjalan". Di layar sempit dapat digeser horizontal.
- Riwayat aktivitas di bawah stepper; event jasa menggantikan entri generik yang menceritakan momen sama agar tidak dobel.
- Panel rincian jasa: header dan riwayat disembunyikan saat tertanam, agreement dilipat, sehingga halaman tidak terasa penuh.
- Lini masa dan rincian jasa hanya tampil setelah bukti transfer diunggah (status bukan lagi `awaiting_payment`).
- Ikon tipe pesanan `marketplace_service` memakai ikon toko; empty state usang diganti.
- Invalidasi daftar `my-service-orders` setelah aksi seller.

## Batas verifikasi

- Realtime diuji lewat kontrak publication dan verifikasi database; tidak ada pengujian websocket live end-to-end.
- Happy path GUI pembeli bukan pemilik toko belum dijalankan; guard kepemilikan tidak dilemahkan.
- Unggah berkas nyata lewat GUI belum diselesaikan sampai tombol kirim, karena memerlukan berkas uji dan akan mengubah pesanan nyata; jalur RPC, policy, dan metadata sudah diuji dengan fixture rollback.
- Tidak ada deployment frontend produksi, commit, atau push.
