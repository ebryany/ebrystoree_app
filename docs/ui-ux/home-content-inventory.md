# Inventaris Konten Home
| Blok | Sumber | Status | Keterangan |
|---|---|---|---|
| Eyebrow "EBRYSTORE" | hardcoded | GENERIC_COPY | Tidak menambah informasi |
| H1 | hardcoded | VERIFIED | Klaim sesuai produk |
| Sub-headline | hardcoded | VERIFIED | |
| CTA "Lihat produk digital" → /produk | route ada | VERIFIED | |
| CTA "Pesan layanan joki" → /layanan | route ada | VERIFIED | |
| Statistik produk/layanan | `getStorefrontSummary` | REAL_DATA | Angka kecil (1 & 1); perlu framing jujur |
| Kartu produk | `listProducts` | REAL_DATA (bocor draft saat login) | Perlu filter published |
| Kartu layanan | belum dipakai | MISSING | `listServices` sudah tersedia + harga paket |
| Keunggulan (3) | hardcoded | HARDCODED | Klaimnya benar, perlu disusun ulang jadi maks. 4 poin nyata |
| Cara kerja | tidak ada | MISSING | Alur nyata ada di `docs/order-state-machine.md` |
| Tracking preview | tidak ada | MISSING | Realtime sudah VERIFIED (subscription aktif di dashboard) |
| FAQ | tidak ada | MISSING | |
| Trust & legal | tidak ada | MISSING | Butuh route baru |
| Footer | hardcoded | PARTIAL | Belum ada legal/bantuan |

## Data nyata yang tersedia untuk Home
- `digital_products` (published): nama, slug, deskripsi singkat, harga, harga diskon, thumbnail, `download_limit`, `validity_days`.
- `services` + `service_packages`: nama, deskripsi, harga mulai, `estimated_days`, `free_revisions`.
- Hitungan katalog. Tidak ada rating, testimoni, atau jumlah pengguna → dilarang dipakai.
