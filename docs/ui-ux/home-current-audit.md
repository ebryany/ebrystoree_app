# Audit Home Ebrystore — Kondisi Saat Ini
Status: HOME_UI_UX_AUDIT_IN_PROGRESS · Tanggal: 2026-07-28

## Berkas terkait
| Elemen | Lokasi | Catatan |
|---|---|---|
| Route Home | `src/routes/index.tsx` | Loader `ensureQueryData` untuk summary + produk |
| Header global | `src/components/site-header.tsx` | Sticky, 2 item nav, drawer mobile sederhana |
| Footer global | `src/components/site-footer.tsx` | 4 kolom, tanpa link legal |
| Data katalog | `src/lib/catalog.functions.ts` | `listProducts`, `listServices`, `getStorefrontSummary` |
| Token desain | `src/styles.css` | Teal + amber, Sora/Manrope/JetBrains Mono sudah dimuat di `__root.tsx` |

## Struktur section sekarang
1. Hero gradien teal — eyebrow, H1, paragraf, 2 CTA, 2 angka statistik.
2. Produk digital — grid maks. 6 kartu (VERIFIED: data nyata).
3. "Kenapa lewat Ebrystore" — 3 kartu statis (HARDCODED, tapi klaimnya benar).
4. CTA "Siap memesan?" — kotak abu, 1 tombol daftar.

## Temuan per status
- REAL_DATA: kartu produk, `productCount`, `serviceCount`.
- HARDCODED: 3 kartu keunggulan.
- MISSING: layanan tidak pernah ditampilkan di Home meskipun `listServices` sudah ada.
- MISSING: tidak ada section cara kerja, tracking preview, FAQ, trust/legal.
- BUG: `listProducts` / `listServices` tidak memfilter `status='published'` dan `deleted_at IS NULL` di query; saat ini tertutup RLS anon, tetapi bocor untuk pengguna yang login (produk draft "sddsds" Rp 0 tampil).
- NOT_RESPONSIVE: hero `py-20/py-28` terlalu tinggi di 320–430px; deretan CTA `flex-wrap` bukan stacked full-width.
- NOT_ACCESSIBLE: drawer mobile tanpa focus trap; tidak ada skip link; ikon dekoratif sudah `aria-hidden` (baik).
- GENERIC_COPY: "Siap memesan?" dan CTA "Buat akun gratis" tanpa konteks nilai.
- BROKEN/EMPTY LINK: footer tidak punya halaman Bantuan, Syarat, Privasi, Kebijakan Refund (belum ada route-nya).

## Animasi saat ini
Hanya `hover:scale-105` pada thumbnail dan transisi border kartu. Tidak ada reveal, tidak ada dukungan `prefers-reduced-motion` (tidak diperlukan saat ini, tapi wajib saat animasi ditambah).
