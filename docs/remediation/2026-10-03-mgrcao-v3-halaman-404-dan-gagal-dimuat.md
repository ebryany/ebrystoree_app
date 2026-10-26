# MGRCAO V3: halaman 404 dan halaman gagal dimuat

Tanggal dokumen: 2026-10-03, mengikuti tanggal sesi.
Status: implementasi lokal telah dijalankan. Unit 238 lulus, build dan HTTP existing lulus. TypeScript masih 70 error baseline + 1 error baru pada test; GUI/visual belum diperiksa. Rincian: [Catatan perubahan dan verifikasi](../audit/2026-10-03-verifikasi-halaman-404-dan-gagal-dimuat.md).
Sumber wajib: [Riset halaman 404 dan gagal dimuat](../audit/2026-10-03-riset-halaman-404-dan-gagal-dimuat.md), dibaca sebelum framework ini ditulis.

## M: Mindset

Perbaiki penanganan halaman tidak ditemukan dan gagal dimuat, bukan seluruh penyebab error aplikasi. 404, query error, halaman kosong, sesi login, izin akses, maintenance, dan missing asset tidak boleh dicampur. Gunakan kemampuan native TanStack Router dan React Query existing. Scope ditentukan evidence F1-F7 di riset, bukan asumsi bahwa semua URL gagal membutuhkan route `/404`.

Urutan pengembangan wajib: riset, dokumen hasil riset, framework MGRCAO V3, baru implementasi jika diminta. Kehadiran framework ini bukan izin otomatis mengubah source atau deployment.

Satu pelaksana. Tidak ada agen/workflow, browser-use, Playwright pengganti, server baru/restart, dependency baru, perubahan database, commit/push/publish, atau AGENTS.md.

## G: Goals

1. Unknown route dan resource publik absent setelah query berhasil memakai not-found router, HTTP 404 pada document request yang dapat diverifikasi; tidak redirect ke beranda atau menghasilkan soft-404.
2. Query error detail produk, layanan, artikel, dan toko tidak menjadi 404 atau empty state palsu.
3. Error child tanpa handler mendapatkan fallback aman melalui default error component router. Root dan fallback server tetap dapat tampil tanpa data settings/session/query.
4. Copy fallback Indonesia, judul/penjelasan jelas, link tujuan nyata, recovery read-only yang benar-benar berjalan.
5. Metadata 404 title relevan dan noindex ditetapkan lewat mekanisme head router yang benar, bukan tag di body. Jangan memberi noindex seluruh halaman sehat.
6. Pertahankan consumer checkout, katalog normal/empty, auth/RBAC, transaksi, maintenance, asset/API, dan desain halaman sehat.

### Kontrak state

- Missing: query sukses + resource null. Boleh notFound().
- Error: query/transport gagal. Tidak boleh notFound(), tidak boleh kosong palsu.
- Empty: query sukses + list kosong. Tetap state halaman normal.
- Privat/tidak tayang: respons publik tetap generik; jangan tampilkan status draft/suspended atau detail ownership.
- Render error: boundary reset boleh membersihkan render state; loader/query retry harus terpisah dan nyata.
- HTTP 500 berlaku pada error SSR sebelum respons committed. Error client/stream yang sudah committed tidak dijanjikan dapat mengganti status HTTP.

## R: Role

Bertindak sebagai Senior Frontend/Full-Stack Engineer spesialis TanStack Start SSR, TanStack Router error/not-found boundaries, React Query recovery, aksesibilitas, dan semantik HTTP. Fokus pada public-page error handling dan return contract data publik minimal, bukan redesign global atau perubahan sistem transaksi.

## C: Context

### Evidence yang menjadi dasar

- F1: `src/routes/__root.tsx` telah mempunyai NotFoundComponent, tetapi copy Inggris dan kontrol belum eksplisit 44px/focus-visible.
- F2: root React fallback serta `src/lib/error-page.ts` server HTML adalah lapisan berbeda. Pertahankan independence server HTML.
- F3: produk/layanan server function sudah mengembalikan error, tetapi loader mengabaikannya.
- F4: getArticleBySlug/getPublicStore kehilangan query-error discriminator; store products failure menjadi array kosong.
- F5: `src/router.tsx` belum menetapkan defaultErrorComponent. Installed Match memilih handler route/default dan SSR reset bisa undefined; boundary reset client sendiri hanya clear state.
- F6: fallback resource dan link `/produk`, `/layanan`, `/artikel`, `/` sudah ada.
- F7: auth, checkout, API/asset, settings, dan maintenance adalah batas regresi, bukan target refactor.

Runtime riset blocked: port 8081 ECONNREFUSED. Tidak menganggap baseline HTTP 404/500 sudah diuji. Panduan resmi main boleh berbeda dari dependency terpasang; periksa source installed/test sebelum keputusan.

### Allowlist source

Perubahan hanya pada bagian yang disebut, bukan format ulang seluruh file:

1. `src/routes/__root.tsx`: fallback root, pemakaian shared error fallback, head scoped error/not-found bila dibutuhkan. Jangan mengubah settings loader, auth listener, maintenance, font/security/global SEO sehat, atau RootShell lang global.
2. `src/router.tsx`: defaultErrorComponent saja bila diperlukan; query defaults dan route matching tetap.
3. `src/lib/error-page.ts`: copy/fallback accessibility/head standalone; bukan transport/status handler.
4. `src/routes/produk.$slug.tsx`, `src/routes/layanan.$slug.tsx`: loader error-before-absence, not-found/error recovery/head saja. Tidak mengubah konten produk, paket, harga, thumbnail, pembelian.
5. `src/routes/artikel.$slug.tsx`: klasifikasi loader, fallback recovery/head. Tidak mengubah konten editorial/render article.
6. `src/routes/toko.$slug.tsx`: klasifikasi loader dan fallback/head. Tidak redesign storefront atau kartu.
7. `src/lib/articles.functions.ts`: hanya getArticleBySlug error discriminator additive; listing/admin/editor tidak diubah.
8. `src/lib/seller.functions.ts`: hanya getPublicStore query error dan return shape additive. Tidak fungsi seller lain atau transaksi.
9. `src/routes/index.tsx`, `src/routes/produk.index.tsx`, `src/routes/layanan.index.tsx`, `src/routes/artikel.index.tsx`: hanya route-level error/not-found recovery. Tidak hero, banner, pencarian, filter, pagination, listing, atau empty-state desain.
10. Maksimum satu file shared baru `src/components/route-fallback.tsx` bila reuse root/default memerlukannya. Tidak folder/package baru atau framework error abstrak.
11. Maksimum satu test scoped baru `src/components/route-fallback.test.tsx`; boleh memperluas test existing yang berhubungan tanpa menghapus assertion sebelumnya.
12. Evidence `.zcode/not-found-fix-*`, dokumen audit verifikasi `docs/audit/2026-10-03-verifikasi-halaman-404-dan-gagal-dimuat.md`, dan status framework ini.

Read-only dependency/consumer di luar allowlist diizinkan untuk memahami kompatibilitas, bukan perubahan. `src/lib/orders.functions.ts` dan `src/lib/catalog.functions.ts` tidak perlu diubah karena kontrak error sudah ada. `src/server.ts`, `src/start.ts`, routeTree.gen.ts, auth/dashboard/checkout/API/asset, registry/settings, CSS global, dependency/lockfile, SQL/database dilarang diubah.

### Non-goals

Tidak CMS 404, halaman `/404` baru, catch-all route, redirect massal, service worker offline, broken-link crawler, monitoring/logging baru, migrasi RBAC, perbaikan seluruh backend, server hosting/CDN config, seller jasa, rekber, saldo, banner atau gambar produk. Temuan baru di luar scope dicatat saja.

## A: Actions

### 1. Preflight sebelum source

- Baca riset dan framework ini. Cocokkan fakta dengan file terbaru; jangan mengandalkan nomor baris lama.
- Simpan baseline diagnostics/test scoped dan snapshot source file yang akan diubah untuk menjaga perubahan lain yang sudah ada.
- Catat bagaimana head unknown route bekerja pada dependency terpasang, bagaimana reset/load errors ditangani, dan kebutuhan QueryClient context. Shared fallback tidak boleh memakai useQueryClient saat provider belum ada.
- Bila butuh source di luar allowlist atau perubahan production, hentikan bagian itu dan catat blocker, jangan memperluas izin.

### 2. Pisahkan missing dan error tanpa mengubah kontrak transaksi

- Produk/layanan: periksa result.error terlebih dahulu, baru resource null menjadi notFound(). Pertahankan return shape server function.
- Artikel/toko: tambahkan error field additive pada semua branch yang diperlukan. Query utama gagal menghasilkan error aman, absence query sukses tetap null+error null.
- Query daftar produk toko gagal tidak ditampilkan sebagai store empty; tampilkan fallback error, tanpa mengubah data toko.
- Related article bersifat optional; jangan merombak query atau membuat kegagalan related menjadi alasan resource utama 404.
- Error yang ditampilkan tidak membawa pesan mentah Supabase, stack trace, URL berisi credential, parameter privat, atau payload pengguna.

### 3. Fallback minimal dan recovery

- Root not-found: "Halaman tidak ditemukan", penjelasan tautan keliru/tidak tersedia, link "Kembali ke beranda"; link katalog produk boleh tambahan paling banyak satu.
- Error: "Halaman belum dapat dimuat", penjelasan netral, "Coba lagi" atau "Muat ulang halaman", serta link beranda/tujuan konteks.
- Pertahankan fallback not-found produk/layanan/artikel/toko dan tujuan nyata existing. Tidak dekorasi/ilustrasi/angka statistik baru.
- Shared default error fallback ringan direkomendasikan supaya route tanpa handler tidak memakai fallback library. Root logging/reportLovableError tetap existing, tidak mengirim telemetry baru atau payload tambahan.
- Retry terikat ke operasi baca saat ini; invalidasi loader/query yang gagal dan reset boundary bila tersedia. Jangan memanggil reset undefined, jangan hanya clear boundary sementara cache error tetap, jangan invalidate seluruh cache tanpa kebutuhan.
- Jika reload penuh adalah solusi minimum yang lebih andal untuk fallback tanpa provider, gunakan label eksplisit "Muat ulang halaman" dan uji tidak ada replay mutasi otomatis. Tidak auto-retry loop atau redirect timer.
- Root/server fallback tidak memakai SiteHeader/SiteFooter yang membutuhkan provider/settings. Resource fallback yang sehat boleh mempertahankan shell existing.

### 4. Head, semantik, aksesibilitas

- Gunakan head router/state not-found yang valid untuk title/noindex, termasuk unknown route; jangan invent prop/API dari dokumentasi versi lain.
- Main landmark, heading jelas, konten Indonesia dengan lang scoped bila root lang tetap en, role alert untuk error bila tepat.
- Kontrol minimum 44px, visible focus, keyboard, link nyata. Tidak menggunakan history.back sebagai satu-satunya jalan keluar.
- Ikuti token, font runtime, dan desain existing. DESIGN.md menyebut stack yang berbeda dari font root aktual; jangan mengganti font untuk menyesuaikan dokumen pada tugas ini.
- Arah fallback: state pemulihan Ebrystore, friendly/simple; ENERGY 1, RHYTHM 1, MOTION 1 untuk layar kegagalan yang perlu tenang. Aksen primary hanya kontrol utama; tanpa animasi/dekorasi baru.
- Jangan ubah status asset/API, auth redirects, security headers, maintenance atau transport 500.

### 5. Acceptance checks

A. Router/unit:
- Unknown global URL, unknown nested/trailing segment, resource absent empat detail.
- Query utama error empat detail tidak menjadi notFound; toko products error tidak menjadi empty.
- Query berhasil/list kosong tetap normal.
- Loader error dan render error tampil aman melalui default/route fallback yang tepat; tidak muncul raw error library.
- SSR render fallback dengan reset undefined tetap aman. Client recovery benar-benar menjalankan load/refetch/reset sesuai sumber error.
- Fallback tanpa settings/session/query provider tidak gagal lagi.
- Title/noindex pada missing page, halaman valid tidak mendapat noindex palsu.
- Return shape consumer checkout produk/layanan tidak berubah; additive article/store tidak merusak caller.
- Link recovery menuju `/`, `/produk`, `/layanan`, `/artikel` sesuai konteks.
- HTML standalone server fallback tetap mandiri, role/main/focus/tap area terperiksa.

B. Unit suite, lint, build:
- Jalankan test scoped lalu suite penuh, ESLint scoped, build tanpa server baru.
- TypeScript dibanding baseline; kegagalan baseline dilaporkan, tidak diperbaiki di luar scope.
- Uji dengan mock query error, bukan mematikan database atau menyisipkan data production.

C. HTTP read-only bila server existing tersedia:
- Ulang probe riset dan assert unknown/missing document status 404, content type HTML, title/copy/noindex, recovery links.
- Halaman sehat tetap 200, asset missing tetap contract existing, auth behavior tidak diredefinisi.
- Error SSR mock/local test harus 500 sebelum stream committed; jangan memaksa outage production.
- Bila localhost tidak tersedia, tandai HTTP blocked dan jangan menyalakan server. Router test bukan bukti deployment.

D. Visual/interaksi:
- Tanpa browser sesuai batas user, jangan klaim click-through, console browser, keyboard, mobile/theme render sudah PASS.
- Catat check source/unit yang dilakukan dan gate GUI yang belum dijalankan. Tidak memakai Playwright sebagai pengganti larangan browser-use.

### 6. Stop conditions dan rollback

- Hentikan jika butuh dependency baru, catch-all/route matching rewrite, auth/backend transaksi, API middleware, database/server/deployment, atau file di luar allowlist.
- Jika semantik HTTP status hanya bisa dibetulkan lewat hosting/transport, dokumentasikan blocker; jangan ubah respons global diam-diam.
- Rollback hanya diff scoped yang dibuat pada pekerjaan ini dari snapshot baseline, bukan overwrite file penuh atau membatalkan perbaikan banner/thumbnail/rekber sebelumnya. Tidak memakai git reset/discard global.
- Tidak publish. Evidence membedakan source selesai, test lulus, HTTP blocked, dan visual belum diperiksa.

## O: Outputs

Tahap penyusunan awal:
- Dokumen riset dibuat sebelum framework.
- Framework ini menetapkan scope, allowlist, acceptance, stop conditions, dan batas klaim.
- Pada tahap awal belum ada source implementation atau database/deployment changes.

Hasil pelaksanaan tercatat dalam dokumen verifikasi di status atas. Database/deployment tidak diubah; acceptance TypeScript dan GUI/visual belum tuntas.

Deliverable implementasi:
- Diff minimum pada allowlist, satu test scoped runnable.
- Dokumen verifikasi berisi hasil tiap acceptance dan log privat `.zcode/not-found-fix-*`.
- Ringkasan apa yang berubah, apa yang tetap, hasil test/build/lint/TypeScript, serta batas HTTP/GUI. Tidak menyatakan semua penyebab halaman gagal sudah diperbaiki.
