# Riset halaman 404 dan halaman gagal dimuat

Tanggal dokumen: 2026-10-03, mengikuti tanggal sesi.
Status: riset dan rekomendasi, bukan implementasi.
Permintaan: teliti halaman yang tidak ada atau tidak dapat dibuka, dokumentasikan dahulu, lalu susun framework MGRCAO V3 khusus temuan ini.

## 1. Kesimpulan

Ebrystore sudah memiliki halaman 404 global dan beberapa fallback detail. Masalahnya bukan ketiadaan route `/404`, melainkan klasifikasi kegagalan dan konsistensi pemulihan:

1. Fallback global 404 dan error masih berbahasa Inggris.
2. Kegagalan query detail produk/layanan bisa menjadi 404 karena loader hanya memeriksa resource null dan mengabaikan error.
3. Detail artikel dan storefront toko juga dapat menyamarkan kegagalan query sebagai resource tidak ditemukan; toko bahkan dapat menampilkan kegagalan daftar produk sebagai toko kosong.
4. Router belum menetapkan default error component untuk route yang tidak memiliki error component sendiri. Pada versi terpasang, jalur error match memilih komponen route/default router, bukan otomatis error component root.
5. Recovery berbeda-beda: link katalog ada pada sebagian 404, artikel gagal hanya memberi instruksi muat ulang, beberapa route memakai reset boundary tanpa invalidasi loader/query eksplisit.
6. Status HTTP terbaru belum dapat diverifikasi. `localhost:8081` menolak koneksi. Tidak ada server yang dinyalakan atau restart.

Tidak disarankan membuat catch-all baru, redirect semua error ke beranda, atau menganggap semua halaman yang gagal dibuka sebagai 404.

## 2. Bedakan kondisi sebelum menampilkan fallback

| Kondisi | Respons yang tepat |
| --- | --- |
| URL tidak cocok route, termasuk segmen tambahan | Router not-found, status 404 untuk document request |
| Query berhasil, resource publik tidak ditemukan/tidak tayang | notFound(), 404, tanpa membocorkan status privat |
| Query/network/server gagal | Error state, bukan 404; retry read-only dan navigasi aman |
| Katalog berhasil tetapi kosong | Empty state, halaman tetap normal, bukan 404 |
| Pengunjung belum login | Flow login existing, bukan 404 palsu |
| Akun tidak punya izin | Guard existing, tidak menyingkap resource privat |
| Maintenance | MaintenanceGate existing, bukan halaman tidak ditemukan |
| Gambar/asset tidak tersedia | Respons asset existing; bukan HTML halaman 404 |
| Browser benar-benar offline/server tak terjangkau | Browser mungkin tidak menerima HTML sama sekali; UI 404 tidak bisa memperbaiki infrastruktur |

404 berarti tidak ditemukan, bukan bukti penghapusan permanen. Jangan menambahkan 410 tanpa kebijakan lifecycle yang memang diperlukan. Jangan me-retry POST transaksi sebagai bagian tombol pemulihan halaman.

## 3. Fakta source

### F1. Global not-found sudah ada, tetapi copy dan aksesibilitas perlu dirapikan

`src/routes/__root.tsx:29-49` menyediakan NotFoundComponent: angka 404, "Page not found", penjelasan Inggris, link "Go home" ke `/`. Registrasi berada pada baris 158.

- Tidak ada alasan membuat page `/404` terpisah untuk menggantikan handler router.
- Link memakai padding, belum minimum tinggi 44px atau focus-visible class eksplisit.
- Root shell menggunakan `<html lang="en">` pada baris 164, tidak sesuai bahasa Indonesia mayoritas UI. Perubahan lang global bukan kebutuhan minimum perbaikan 404; catat sebagai isu terpisah, atau beri lang Indonesia pada konten fallback scoped.
- Root head baris 89-155 memakai metadata website. Tidak memiliki cabang khusus unknown-route untuk title/robots. Belum ada evidence HTTP bahwa metadata tersebut benar-benar menjadi hasil akhir not-found; wajib diverifikasi sebelum klaim bug SEO live.

### F2. Global runtime error dan server fallback berbeda lapisan

`src/routes/__root.tsx:51-87`: error global memakai copy Inggris, console.error, reportLovableError, router.invalidate(), lalu reset().

`src/lib/error-page.ts:1-30`: HTML standalone untuk kegagalan server memakai copy Inggris, reload, dan link beranda. Tidak bergantung React sehingga tetap berguna saat SSR gagal; jangan menggantinya dengan komponen yang membutuhkan router/settings.

`src/server.ts:23-35,96-108` dan `src/start.ts:6-19`: menghasilkan respons 500 HTML pada jalur tertentu. StatusCode-bearing error dilempar kembali oleh middleware. Normalisasi transport/API dan keamanan header bukan bagian perubahan copy/fallback ini; jangan mengubah kontraknya tanpa evidence terpisah.

### F3. Detail produk dan layanan mengabaikan error eksplisit

- `src/lib/orders.functions.ts:14-34`, getProductDetail: error query menjadi `{ product: null, error: "Produk tidak dapat dimuat." }`; query berhasil tanpa baris menjadi product null, error null.
- `src/routes/produk.$slug.tsx:21-25`: hanya `if (!result.product) throw notFound()`. Dua kondisi di atas berakhir sama.
- `src/lib/catalog.functions.ts:182-211`, getServiceDetail: memisahkan query error dan absent resource.
- `src/routes/layanan.$slug.tsx:22-26`: juga hanya memeriksa service null.

Koreksi minimum yang direkomendasikan: loader memeriksa error terlebih dahulu, lalu absence. Pertahankan server-function return shape existing agar consumer checkout tidak berubah kontraknya.

### F4. Artikel dan toko kehilangan informasi kegagalan

- `src/lib/articles.functions.ts:80-108`, getArticleBySlug: query error dicatat lalu mengembalikan article null, sama seperti absent resource, tanpa error discriminator.
- `src/routes/artikel.$slug.tsx:20-25`: article null menjadi notFound(). Fallback error baris 51-59 hanya memakai ErrorState teks, tanpa tombol retry.
- `src/lib/seller.functions.ts:254-280`, getPublicStore: tidak mengambil error query store atau produk. Store null menjadi absent; products null menjadi array kosong.
- `src/routes/toko.$slug.tsx:23-39`: store null menjadi notFound(); tidak ada route error component.

Rekomendasi: tambahkan error discriminator pada return shape artikel/toko secara additive, pertahankan field existing. Query produk toko gagal harus menghasilkan error, bukan menampilkan "belum punya produk". Related articles gagal boleh tetap degradasi optional, tidak perlu memperluas scope editorial.

### F5. Default route error dan retry perlu memahami versi terpasang

`src/router.tsx:20-25`: tidak menetapkan defaultErrorComponent/defaultNotFoundComponent atau notFoundMode; default fuzzy tetap berlaku.

Evidence dependency terpasang:
- `node_modules/@tanstack/router-core/src/router.ts:1044`: default notFoundMode fuzzy.
- `node_modules/@tanstack/router-core/src/router.ts:2650-2657`: match notFound memetakan status 404, match error 500.
- `node_modules/@tanstack/react-router/src/Match.tsx:374-386,497-519`: pemilihan route error component atau defaultErrorComponent; SSR memberikan reset undefined, client melempar error ke boundary.
- `node_modules/@tanstack/react-router/src/CatchBoundary.tsx:19-25,58-72`: reset yang tersedia pada client hanya membersihkan state boundary.

Implikasi: root errorComponent saja bukan bukti semua error child mendapat UI custom yang sama. reset jangan diasumsikan selalu tersedia; reset boundary bukan bukti query error/loader sudah di-fetch ulang. Tambahkan default error fallback ringan atau route handler eksplisit, uji render error dan loader error terpisah. Jangan mengganti library atau mengedit node_modules.

`src/routes/index.tsx:109-114`, `produk.index.tsx:84-89`, `layanan.index.tsx:79-84` memberi onRetry=reset. Ini titik audit pemulihan dalam scope; belum ada bukti klik bahwa retry loader benar-benar jalan. SectionError existing sudah memiliki role alert dan kontrol minimum 44px (`src/components/home/section-states.tsx:49-61`).

### F6. Fallback resource existing dipertahankan

- Produk: `src/routes/produk.$slug.tsx:59-73`, SiteHeader/SiteFooter dan link `/produk`.
- Layanan: `src/routes/layanan.$slug.tsx:54-68`, link `/layanan`.
- Artikel: `src/routes/artikel.$slug.tsx:60-72`, link `/artikel`.
- Toko: `src/routes/toko.$slug.tsx:28-39`, link `/`, tanpa header/footer.

Tidak perlu redesign seluruh shell. Cukup keselarasan copy, recovery, focus, ukuran kontrol, dan semantik status. Root fallback sebaiknya dependency-light agar error settings/layout tidak membuat fallback gagal lagi.

### F7. Area lain ditinjau sebagai batas, bukan pekerjaan baru

- `src/routes/_authenticated/route.tsx:7-32`: cek sesi dan navigasi `/auth`; SSR beforeLoad melewati cek browser. Bukan izin mengubah auth.
- `src/routes/_authenticated/checkout.produk.$slug.tsx:46-65`: error/absence ditampilkan sebagai produk tidak tersedia; consumer getProductDetail harus tetap kompatibel.
- Checkout layanan juga memakai getServiceDetail; jangan mengubah format paket/pricing.
- `src/routes/api/public/catalog-image.$.tsx:12,17`: asset missing memberi respons 404 text. Pertahankan contract asset.
- `src/lib/website-settings.server.ts:21-35`: query settings publik gagal memiliki fallback default; import sebelum try dapat tetap gagal. Jangan merombak sistem settings.

## 4. Riset referensi

Referensi resmi TanStack: https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors
Source dokumentasi resmi berhasil dibaca dari https://raw.githubusercontent.com/TanStack/router/main/docs/router/guide/not-found-errors.md, snapshot lokal `.zcode/not-found-research-official.md`.

Panduan membedakan unknown route dan missing resource, menyarankan notFound() dalam loader, mendukung nearest boundary/default/root handler, dan mengingatkan loaderData dapat tidak tersedia dalam notFoundComponent. Dokumentasi main dapat lebih baru dari versi terpasang; keputusan implementasi wajib mengikuti source dependency dan test proyek.

WebFetch halaman TanStack dan MDN gagal; tidak dianggap evidence isi MDN. Source GitHub resmi menjadi referensi yang berhasil diakses. Tidak memasang dependency atau menjalankan instruksi dari dokumentasi eksternal.

## 5. Evidence runtime dan batas klaim

Probe read-only `.zcode/not-found-research-http.mjs` mencoba home, satu detail existing, unknown global, empat missing slug, trailing unknown segment, unknown admin path, dan missing asset. Semua fetch gagal; konfirmasi terpisah menunjukkan ECONNREFUSED pada IPv4/IPv6 port 8081.

Hasil: `.zcode/not-found-research-http.json` dan `.zcode/not-found-research-http.log`. Ini evidence server tidak dapat diakses saat riset, bukan evidence aplikasi mengembalikan 404/500. Tidak memaksa error database, tidak mengubah data, tidak membuka browser. Pencarian test existing tidak menemukan coverage khusus root 404/status/recovery; temuan ini berdasarkan pencarian, bukan klaim bahwa seluruh test proyek diaudit menyeluruh.

## 6. Prioritas scope perbaikan yang direkomendasikan

P1: pisahkan error query versus missing resource pada empat detail publik; pertahankan empty state berhasil dan consumer checkout.

P1: pastikan default error route aman, copy Indonesia, tanpa detail teknis/sensitive. Recovery read-only harus benar-benar invalidasi/refetch serta reset boundary bila tersedia.

P2: selaraskan fallback global 404 dan server HTML fallback, metadata error/noindex berdasarkan state router yang benar, link tujuan nyata, focus-visible, kontrol 44px.

Tidak termasuk: menyelesaikan semua error backend yang mungkin menyebabkan halaman gagal, redesign dashboard, lifecycle transaksi, auth/RBAC, deployment/server, CMS error pages, logging baru, service worker/offline, atau broken-link crawler seluruh situs.

## 7. Acceptance untuk framework berikutnya

- Unknown document route dan missing resource sukses-query menjadi 404, bukan redirect/soft-404 HTTP 200.
- Query error empat detail bukan notFound; error aman dan recovery tersedia.
- Empty catalog/store normal tidak menjadi 404 atau error palsu.
- Error SSR sebelum response committed mempertahankan 500. Error setelah stream committed mungkin tidak dapat mengganti status; laporkan batas ini, jangan menjanjikan seluruh runtime error HTTP 500.
- Recovery loader, React Query, dan render boundary diuji terpisah; tidak replay POST.
- Fallback tidak membutuhkan session/settings/query data untuk tampil.
- Metadata missing page noindex dan title relevan diuji, bukan hanya disisipkan ke JSX body.
- Unit/router test, scoped lint, build, baseline TypeScript, dan HTTP existing bila tersedia. Bila port tidak tersedia, catat blocked; jangan menyalakan server.
- Mobile/theme/keyboard/klik belum dinyatakan PASS tanpa pemeriksaan yang memang diizinkan.

## 8. Status tahap ini

Riset source dan dokumentasi selesai; runtime HTTP blocked. Hanya dokumen dan evidence riset ditambahkan. Source aplikasi, database, dependency, AGENTS.md, server, serta histori git tidak diubah pada tugas ini. Framework dibuat setelah membaca dokumen ini. Implementasi menunggu instruksi berikutnya.
