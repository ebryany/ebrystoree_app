# MGRCAO V3: homepage banner dan katalog jasa seller

## M: Mission
Ganti panel pencarian homepage dengan slider banner unggahan admin, tambahkan jasa seller di homepage, tampilkan seluruh jasa seller yang layak publik di `/layanan` melalui pagination.

## G: Goal
Banner yang sudah diunggah tetap digunakan. Admin dapat menambah beberapa banner tanpa mengedit kode. Jasa approved dari toko aktif/kategori aktif terlihat oleh pengunjung. Draft, review, rejected, archived, toko nonaktif dan kategori nonaktif tidak bocor. Checkout jasa tetap nonaktif.

## R: Role
Senior frontend engineer spesialis UI/UX marketplace, mengerjakan sendiri tanpa spawn agent. Inspeksi source sebelum edit, gunakan komponen dan dependency existing. Integrasi server harus memisahkan field publik dan privat.

## C: Context dan Constraints
Sumber: `docs/ui-ux/2026-10-03-riset-home-banner-jasa-publik.md`. React/TanStack/Supabase/Tailwind. ENERGY 2 / RHYTHM 2 / MOTION 1. Jangan mengubah checkout, moderasi, pembayaran, ledger atau RLS; jangan membuat data jasa/banner palsu; jangan melakukan transaksi atau keputusan moderasi untuk tes. Tidak commit/push/deploy.

## A: Actions
1. Tambah registry koleksi banner dan validasi ketat aset unggahan serta alt. Tambah editor upload memakai izin/pipeline existing dan blokir upload/save ketika disabled/busy.
2. Buat renderer slider reusable dengan Embla existing, kontrol 44px, keyboard/swipe, tanpa autoplay; gunakan juga dalam preview admin.
3. Buat endpoint GET jasa seller tervalidasi. Query server-only approved + active store + active service category, filter q/category, urutan deterministik, pagination dan proyeksi field publik.
4. Hapus panel homepage lama. Tambah section jasa seller dengan loading/error/empty; pertahankan produk digital dan layanan platform.
5. Pindahkan sumber `/layanan` ke jasa seller; buat kartu dengan disclosure kesepakatan dan pesan checkout nonaktif. Sinkronkan copy approval seller/admin.
6. Tes renderer, validasi banner, query visibility/filter/pagination dan projection. Jalankan regresi unit, scoped lint, build, typecheck. Catat batas verifikasi GUI.

## O: Output dan Acceptance
- Dua dokumen ini ada sebelum implementasi.
- Judul/panel pencarian lama tidak muncul; banner mengambil setting admin, bukan hardcoded promo.
- Banner lama kompatibel; koleksi validasi maksimal lima tambahan; alt aman; mobile opsional.
- Slider manual berfungsi melalui swipe/keyboard/panah; satu banner tidak menampilkan kontrol palsu; kosong tidak menampilkan promo buatan.
- Admin preview memakai renderer yang sama; upload menghormati disabled/busy.
- Homepage punya produk digital, jasa seller, dan layanan platform yang dibedakan.
- `/layanan` memakai jasa seller, filter dan pagination server; tidak memotong katalog ke satu halaman.
- Kartu seller tidak memakai slug/checkout platform; kesepakatan dapat dibaca lengkap.
- Hasil publik tidak memuat field moderation_note, reviewed_by, owner_id, kontak, draft/rejected/archived.
- Konstanta dan RPC checkout tetap nonaktif.
- Hasil tes/build nyata, kegagalan global dan GUI yang belum diuji dinyatakan jujur.
