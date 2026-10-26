# MGRCAO V3: pembayaran manual dalam kontrak ledger existing

Tanggal: 2026-10-02.
Dasar: [riset pembayaran manual](../audit/2026-10-02-riset-pembayaran-manual-escrow.md), dibaca sebelum perubahan source.
Status: source selesai; migration remote diterapkan dan uji DB/Storage lulus 2026-10-02 setelah otorisasi owner. GUI tidak diuji, browser-use dilarang owner. Detail hasil: [evidence](2026-10-02-evidence-pembayaran-manual-escrow.md).

## M: Mindset

Perbaiki jalur manual yang hilang, bukan membangun escrow baru. Dana diterima platform; bukti saja tidak melunaskan order. Finance menyetujui melalui RPC existing, lalu entitlement, status order, audit dan trigger ledger existing bekerja dalam transaksi DB. Jangan mengklaim saldo ledger sebagai dana withdrawable atau escrow legal. Gunakan satu subagent riset saja. Tidak menyalakan/restart server atau mengirim pembayaran nyata. Larangan migration remote pada tahap source digantikan otorisasi owner untuk menerapkan hanya migration scoped ini; target dan status pending wajib diperiksa.

## G: Goal dan acceptance criteria

1. Buyer pemilik order mendapat instruksi manual dari settings privat, nominal `payment.expected_amount` setelah kredit, deadline dan form bukti. Flag manual nonaktif, akun tidak lengkap, expired atau rail gateway tidak membuka form.
2. Unggah hanya JPG/PNG/WEBP/PDF, maksimal 5 MiB (5.242.880 byte). Path mengikat UID dan payment; object nyata diperiksa di DB. UI validation bukan boundary keamanan.
3. Submit hanya manual/DANA milik buyer yang masih awaiting_payment; payment menjadi waiting_verification dan order payment_under_review. Tidak ada entitlement/credit seller sebelum approve. Initial submission + maksimal tiga reupload dipertahankan.
4. Finance hanya dapat memutuskan manual waiting_verification dengan submitted proof. Reject/reupload wajib alasan. Approval nominal berbeda ditolak; mismatch ditampilkan jelas. Gunakan review existing, bukan menambah enum needs_review ke seluruh aplikasi.
5. Approval mempertahankan semua efek RPC existing, termasuk entitlement idempoten, invoice, completion digital/assignment service, notification, task dan audit. Trigger seller dan refund tidak diubah.
6. RPC manual menolak gateway. Write metadata QRIS tidak boleh menimpa payment yang sudah masuk review/paid; perubahan gateway hanya guard konflik tersebut.
7. Unit regression terarah dan lint file berubah dijalankan tanpa server. Bukti statis, runtime DB/Storage dan klik browser dipisahkan. Deployment/DB/Storage sudah teruji; GUI tetap belum diuji.

## R: Role

Engineer pembayaran manual: menghubungkan UI existing ke RPC, menguatkan boundary bukti, menjaga kontrak ledger existing. Bukan perancang wallet/payout/escrow baru.

## C: Context terkunci

- Checkout sudah membuat manual/DANA; halaman pesanan hanya QRIS.
- Definisi verify terbaru ada pada migration `20260807132231`; semua efek bisnisnya harus dipertahankan.
- Trigger 1 Oktober sudah mengkredit seller saat digital completed. Jangan memperbaiki ulang temuan audit historis.
- Ledger seller satu saldo credit dikurangi debit. Held/available dan release/payout belum ada.
- QRIS mengubah row payment yang sama; kedua rail harus eksklusif.
- `reupload_count` menghitung submission awal juga; guard `count > limit` memungkinkan initial + tiga ulang.
- Bucket payment-proofs wajib privat. Provisioning disiapkan di migration baru, bukan mutasi remote diam-diam.

## A: Action berurutan

1. Simpan backup file existing yang akan diubah di folder remediation di luar src/routes.
2. Tambahkan validasi/helper manual kecil yang dapat diuji; prepare signed upload ber-auth dan owner-scoped pada orders.functions.
3. Pulihkan form manual pada section pembayaran existing. Pilihan QRIS tidak auto-start bersamaan ketika manual dipilih. Gunakan Button/Input/Label existing, tanpa redesign.
4. Tambah satu migration baru: bucket privat, validasi proof/rail/settings/state, revoke direct proof INSERT, harden submit dan verify dengan mempertahankan body fulfillment existing.
5. Perketat actionable finance dan guard conditional write QRIS saja.
6. Jalankan unit terarah, lint source berubah, build tanpa start server bila tersedia. Tulis hasil evidence jujur.

## O: Output, scope dan rollback

Deliverables: riset MD, framework ini, perubahan source minimal, satu migration SQL, regression tests dan evidence MD.

Allowlist: orders.functions.ts; transaction.server.ts untuk mapping/settings manual; manual-payment.ts helper; komponen form manual kecil; dashboard.pesanan.$id.tsx; admin/payments.$id.tsx; payments.functions.ts untuk cross-rail write guard; satu migration dan test manual; dokumen remediation.

Non-goals: seller ledger/earnings/refund/payout, held/available balance, dispute, PO, completion/delivery redesign, provider/webhook refactor, katalog/seller/moderasi, AGENTS.md, dependency baru, enum state global, server restart, migration remote di luar migration pembayaran manual yang diotorisasi.

UI mengikuti komponen dan tokens halaman existing (ENERGY 1 / RHYTHM 1 / MOTION 1). Tujuan layout: rekening dan nominal sebelum bukti; satu submit utama; status review menggantikan form. Tidak ada aset, warna, font, animasi atau navigasi baru.

Rollback: pulihkan source dari backup bila diperlukan. Migration sudah diterapkan; snapshot definisi lama tersimpan di manual-payment-db-before.json. Jangan rollback data pembayaran/ledger. Pemulihan DB memerlukan pemeriksaan dependency/state dan otorisasi terpisah, bukan DROP sembarang atau mengembalikan kelemahan akses diam-diam.

BR-60 literal needs_review tetap gap dokumentasi: slice ini memakai waiting_verification existing dengan mismatch guard, tidak mengklaim enum baru sudah diimplementasikan.
