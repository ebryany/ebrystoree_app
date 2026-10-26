# MGRCAO V3: panel pencarian home netral

Tanggal: 2026-10-02. Disusun sebelum edit. Otorisasi owner: hilangkan warna blok pada section “Cari kebutuhan digitalmu di Ebrystore.” karena terlihat AI slop.

## M: Mindset

Pencarian merupakan utilitas marketplace, bukan banner promosi berwarna. Perubahan minimum, tanpa mengganti hue atau menambah dekorasi.

## G: Goals

Panel menggunakan permukaan card netral mengikuti tema, judul foreground, deskripsi muted. Tombol Cari tetap primary sebagai penanda tindakan. Tidak menghilangkan pencarian, akses belanja, atau pencarian navbar.

## R: Role

Satu engineer. Tidak agen, browser/browser pengganti, server/restart, dependency, database, publish, atau operasi git.

## C: Context

MarketplaceDiscovery di src/routes/index.tsx memakai bg-primary/text-primary-foreground pada section dan deskripsi. Owner menolak blok warna tersebut. DESIGN.md existing dipertahankan; preferensi owner mempersempit penggunaan aksen pada tindakan, bukan latar panel.

Design read: discovery marketplace digital, ENERGY 2 / RHYTHM 2 / MOTION 1. Card netral memberi fokus pada pencarian; divider membedakan akses belanja tanpa blok warna kedua. Typography, ukuran, struktur, data, dan routing tetap.

Allowlist:
- src/routes/index.tsx: kelas section/deskripsi/nav MarketplaceDiscovery saja.
- src/components/home/marketplace-home.test.tsx: regression panel netral.
- Dokumen ini, evidence terkait, log .zcode/home-card-*.

Revisi kartu home yang sedang berjalan tetap tugas tersendiri dengan framework sebelumnya. Tidak mendesain ulang kategori, kartu, navbar, footer, layanan, katalog, transaksi, backend, atau settings dalam revisi panel ini.

## A: Actions

1. Ganti background section menjadi bg-card dan teks menjadi text-foreground.
2. Deskripsi memakai text-muted-foreground; nav memperoleh border-t sebagai pemisah.
3. Pertahankan copy, form, maxLength 80, trim, destination /produk, 44px controls dan focus ring.
4. Tambah regression yang mengisolasi section home-heading, memastikan tidak ada blok bg-primary pada section, tombol tetap submit, akses belanja tetap.
5. Jalankan unit/scoped lint/build, kontras token light/dark, HTTP GET server existing. Catat TypeScript baseline dan batas GUI. Tidak klaim screenshot/click-through PASS.

## O: Outputs

Panel pencarian netral sesuai koreksi owner, regression dan evidence. Tidak publish; visual/mobile/keyboard browser belum diverifikasi karena larangan owner.
