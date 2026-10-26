# MGRCAO V3: banner background home custom

Tanggal: 2026-10-03.
Status: framework untuk implementasi berikutnya, bukan bukti implementasi atau deployment.
Dasar: [Riset banner background home custom](../audit/2026-10-02-riset-banner-background-home-custom.md).
Otorisasi saat penulisan: membuat dokumen framework saja. Tidak mengedit aplikasi, SQL, database, dependency, atau settings.

## M: Mindset

Bangun satu background gambar yang dikelola admin pada section pencarian home existing. Fokus pada kontrol owner, keterbacaan, dan perubahan yang benar-benar tersimpan. Jangan mengubahnya menjadi banner promosi terpisah, slider, CMS, atau tema website otomatis.

Gunakan registry settings, root loader, storage dan komponen existing sejauh aman. Jangan menganggap validasi browser, permission tombol, atau policy staff existing cukup untuk melindungi aset branding. Lebih baik menandai blocker daripada mengklaim keamanan/visual sudah lulus tanpa evidence.

Dokumen ini menjadi batas pekerjaan. Keberadaannya tidak mengotorisasi eksekusi atau perubahan production. Implementasi dimulai hanya setelah owner memerintahkan pengerjaan.

## G: Goals

1. Admin berizin dapat memilih gambar utama, opsional mobile, mengatur focal point, melihat preview, lalu menyimpan background home.
2. Gambar tampil sebagai background section “Cari kebutuhan digitalmu di Ebrystore.”, termasuk area pencarian dan akses belanja dalam section yang sama. Tidak menambah section baru.
3. Judul, deskripsi, input, tombol Cari dan ketiga akses belanja tetap HTML, bukan teks tertanam di bitmap.
4. Preview memakai renderer yang sama dengan home agar crop dan posisi konten tidak berbeda.
5. Draft/upload belum mengubah banner publik; save sukses memperbarui pointer dan loader; save gagal mempertahankan nilai publik lama.
6. Background kosong/invalid/gagal dimuat mengembalikan panel netral, bukan blok teal solid.
7. Upload/save dan writer alternatif mempunyai validasi serta authorization server-side. Staff tanpa izin tidak dapat menimpa atau menghapus aset banner.
8. Kartu produk, navbar search, katalog, layanan, transaksi, dan konfigurasi branding lain tetap kompatibel.

## R: Role

Bertindak sebagai **Senior Full-Stack Engineer spesialis konfigurasi banner marketplace**, dengan keahlian React/TypeScript, TanStack Start SSR, UI responsif dan aksesibilitas, serta keamanan upload aset pada Supabase Storage/RLS.

Tanggung jawab khusus:
- Merancang background banner yang tetap terbaca, responsif, keyboard-accessible, dan konsisten antara home serta preview admin.
- Mengintegrasikan draft, validasi, save/reset, registry settings publik, root loader SSR, dan invalidasi cache tanpa menggandakan sumber data.
- Menegakkan trust boundary upload/persist/serve: validasi file/path, permission branding, policy storage, serta kompatibilitas cache immutable.
- Memeriksa regression dan mendokumentasikan evidence; membedakan hasil unit/source dari bukti RLS live, visual, dan deployment.

Peran ini tidak mencakup redesign marketplace keseluruhan, refactor RBAC global, transaksi/rekber, atau operasi production tanpa otorisasi. Satu pelaksana, bukan tim multi-agent; tanpa agen atau CreateWorkflow. MGRCAO adalah framework prompt, bukan permintaan orkestrasi workflow.

Batas operasional yang tetap berlaku:
- Jangan menyalakan/restart dev server, preview server, atau layanan lain.
- Jangan browser-use, browser pengganti, atau menjalankan Playwright sebagai cara menghindari larangan browser.
- HTTP GET pada localhost:8081 hanya jika server existing tersedia; tidak menyalakan server jika gagal.
- Jangan menambah dependency, mengubah AGENTS.md, commit/push/publish, atau menulis ulang histori Lovable.
- Jangan menampilkan credential, service-role key, token, data pribadi atau snapshot production.
- Database/storage production tidak diubah hanya karena implementasi source diotorisasi. Deployment membutuhkan evidence dan otorisasi tersendiri.

## C: Context

### C-01. Fakta yang menjadi dasar

Baca dokumen riset lengkap sebelum edit. Verifikasi source terbaru pada bagian yang akan disentuh; nomor baris riset bisa bergeser.

- MarketplaceDiscovery pada src/routes/index.tsx belum membaca URL banner; panel sekarang netral, pencarian q trim dan maxLength 80.
- Registry Branding di src/lib/website-settings.ts memakai settings.branding.update, tetapi belum memiliki key banner.
- getPublicWebsiteSettings/readPublicSettings menyaring PUBLIC_KEYS, root loader memuat values, useWebsiteSettings membaca values tersebut. Gunakan jalur SSR ini, tanpa query/banner fetch tambahan.
- ImageUploader memakai catalog-images, UUID dan upsert:false; validasi MIME/3 MB masih client-side. FieldEditor hanya memilih uploader untuk key url yang mengandung logo.
- SettingsPreview belum memakai layout pencarian home. Save admin menginvalidasi query, belum secara eksplisit root loader.
- Route catalog-image publik memakai cache immutable satu tahun. Policy catalog-images lokal berdasarkan is_staff, lebih luas daripada izin branding. Setting write RLS lokal berdasarkan is_admin; writer MCP juga harus diperiksa.
- Konfigurasi bucket/policy production belum diperiksa. Source migration bukan bukti keadaan live.

Baseline historis sebelum fitur: 165 unit test PASS, scoped lint/build PASS, 70 diagnostic TypeScript pada output tertangkap dengan command dibatalkan. Ini bukan baseline pemeriksaan baru; catat ulang saat implementasi. Visual/mobile/browser belum diverifikasi.

### C-02. Arah desain

Design read: discovery marketplace produk digital Ebrystore, arah DESIGN.md existing, ENERGY 2 / RHYTHM 2 / MOTION 1.

- Background menggunakan gambar owner, bukan gambar buatan atau stock yang dipilih tanpa izin.
- Aksen primary tetap pada tindakan/focus; tidak mengambil warna dominan gambar untuk mengubah tema.
- Teks dan form berada pada backing card netral solid terbatas pada konten. Alasan: gambar arbitrary tidak menjamin kontras teks di seluruh area.
- Desktop dengan gambar: content backing maksimal sekitar dua pertiga lebar section, menyisakan area gambar terbuka di samping. Mobile: backing konten tetap lebar usable, sisakan area gambar terbuka di atas konten sekitar 6rem sebagai titik awal. Ukuran tersebut keputusan awal proyek, bukan bukti visual lulus; jangan memotong form atau membuat ruang kosong saat gambar tidak ada/gagal.
- Akses belanja tetap strip netral dalam section yang sama; teks/link tidak menjadi bagian gambar.
- Layer gambar cover, focal point native, alt kosong, pointer-events none. Konten menentukan tinggi; tidak ada tinggi tetap yang memotong UI.
- Tanpa gambar, pertahankan layout panel netral existing. Jangan menambahkan ruang ilustrasi kosong.
- Feedback warna/focus saja, <=200ms, reduced motion. Tanpa carousel, glow, gradient teal, autoplay, scale atau animasi dekoratif baru.

### C-03. Konfigurasi minimum

Tambahkan hanya empat key publik pada kelompok Banner home di Branding:

| Key | Validasi | Default |
| --- | --- | --- |
| home_banner_image_url | kosong atau path aset banner same-origin terverifikasi | kosong |
| home_banner_mobile_image_url | kosong atau path aset banner same-origin terverifikasi | kosong |
| home_banner_position_x | number finite, integer, 0..100 | 50 |
| home_banner_position_y | number finite, integer, 0..100 | 50 |

Gambar utama kosong berarti banner nonaktif; aset mobile tidak mengaktifkan banner sendiri. Mobile kosong memakai gambar utama. Focal point yang sama dipakai kedua aset untuk versi pertama. Semua key mendapat default aman dan validasi saat read terhadap nilai tersimpan malformed.

Tidak perlu flag tambahan, tabel baru, pengaturan copy, overlay bebas, warna teks, jadwal, atau focal point mobile terpisah. Label dan copy panel existing dipertahankan.

### C-04. Allowlist implementasi source

- src/routes/index.tsx: MarketplaceDiscovery dan wiring settings saja; section kategori/produk/layanan tidak diubah.
- src/lib/website-settings.ts: empat key, metadata control aset bila dibutuhkan, validator banner saja.
- src/lib/website-settings.functions.ts dan website-settings.server.ts: validasi/persist/read banner saja, tanpa refactor seluruh settings.
- src/routes/_authenticated/admin/settings.website.tsx: controls Banner home, disabled/upload state, save/reset banner dan root invalidation.
- src/components/admin/settings-preview.tsx: preview banner memakai renderer sama, preview lain tetap kompatibel.
- src/components/admin/image-uploader.tsx: perubahan opt-in/kompatibel untuk banner; uploader logo/katalog tidak kehilangan fungsi.
- Maksimal satu komponen render shared baru dan satu modul server upload/validasi khusus banner bila existing tidak mencukupi. Tentukan path konkretnya di catatan implementasi sebelum membuatnya; jangan membuat service/factory/framework generik.
- src/lib/mcp/tools/update-website-settings.ts: guard/validasi untuk key banner saja jika jalur ini menerima key baru.
- src/routes/api/public/catalog-image.$.tsx: guard/header cabang aset banner bila diperlukan; jangan mengubah kontrak aset katalog lain.
- src/components/home/marketplace-home.test.tsx dan satu test banner kecil bila diperlukan untuk validator/server behavior. Tidak menambah test framework.
- Framework/evidence terkait, log .zcode/home-banner-*.

Tidak perlu mengedit hook/root hanya untuk menambah query baru. Jika bukti menunjukkan root/hook perlu perubahan, tulis kebutuhan spesifik dan revisi allowlist sebelum edit.

### C-05. Gate storage/security, bukan izin SQL otomatis

Audit read-only bucket, prefix, writer, RLS settings/storage dan endpoint aset sebelum menetapkan jalur upload final. Bila akses live tidak tersedia, tandai belum diverifikasi; jangan menganggap policy lokal sudah deployed.

Target path katalog bila aman: /api/public/catalog-image/branding/home/<UUID>.<ext>. URL disimpan merupakan path aplikasi, bukan URL arbitrary. Pemakaian bucket existing wajib memenuhi batas banner pada authorization dan validasi server.

Policy permissive lama dapat tetap mengizinkan operasi walaupun ada policy baru yang ketat. Jangan hanya menambah policy branding lalu mengklaim staff sudah dibatasi. Dilarang mempersempit seluruh catalog-images tanpa memeriksa consumer existing.

Jika perlindungan prefix existing tidak dapat dipenuhi tanpa migration/storage change, catat blocker beserta SQL scope minimum. Bucket khusus banner hanya dipilih jika bukti menunjukkan isolasi tersebut memang diperlukan; URL/path validator harus diselaraskan dalam framework sebelum implementasi. Jangan membuat fallback insecure atau melakukan deployment diam-diam.

Decoder/verifikasi gambar server harus menggunakan kemampuan runtime/dependency existing yang telah diperiksa. Jangan mengklaim MIME/signature sebagai decode penuh. Jika format yang diperlukan tidak dapat diverifikasi secara aman tanpa dependency baru, catat blocker; jangan menambah dependency atau menurunkan validasi diam-diam.

## A: Actions

### A-01. Baseline dan kontrak

1. Baca riset, DESIGN.md, framework ini, kemudian source scoped.
2. Catat jalur settings publik, admin save/reset, MCP, SQL/RLS, upload/serve dan consumer uploader existing.
3. Catat hasil unit/lint/build/TypeScript terbaru dan batas pemeriksaan. Jangan memperbaiki baseline di luar scope.
4. Tetapkan satu kontrak banner untuk renderer/preview/validator. Jalankan gate C-05 sebelum mengaktifkan upload/persist fitur.

### A-02. Validasi trust boundary

1. URL harus kosong atau path banner canonical dengan UUID/ext yang diizinkan, tanpa traversal/encoded bypass/query/fragment/protocol-relative/external origin. Jangan menerima CSS mentah, mailto, data, javascript, file, SVG atau HTML.
2. Jangan memakai isSafeUrl navigation sebagai satu-satunya validator aset. Jangan fetch URL pengguna dari server.
3. Validasi byte length <=3 MB server-side; file nonempty, MIME/ext/signature konsisten, decode serta dimensi/pixel count dibatasi. Tetapkan ceiling dimensi/pixel sebelum edit berdasarkan kemampuan decoder dan catat alasannya; jangan memproses gambar tanpa batas.
4. Dukungan JPEG/PNG/WebP/AVIF harus terbukti sesuai verifier existing. Tolak animated/malformed bila tidak didukung. Batas UI hanya pendamping validasi server.
5. Authorization settings.branding.update pada upload/save, writer MCP yang menerima banner, dan tindakan mutasi aset. Verifikasi storage/direct database tidak membypass aturan final.
6. Simpan hanya pointer ke object banner publik yang ada dan sudah lolos verifikasi. Setting malformed dibaca sebagai default aman; tidak menghalangi home/settings lain.
7. Respons aset menggunakan Content-Type yang sesuai serta nosniff pada jalur banner. Jangan membuat endpoint publik untuk file privat.

### A-03. Upload dan draft

1. Gunakan UUID baru/upsert:false. Jangan overwrite object yang dipakai cache immutable.
2. Uploader mengikuti disabled/busy; blok save banner selama upload belum selesai. Error upload mempertahankan draft/pointer sebelumnya.
3. Upload sukses memperbarui draft, bukan banner publik. Label “Gambar diunggah, simpan untuk menerapkan” atau padanan yang jelas.
4. Clear background hanya mengosongkan draft. Jangan menghapus object lama saat replace, cancel, clear, reset atau rollback.
5. Tidak membangun cleanup otomatis. Catat kemungkinan orphan object; cleanup retention merupakan scope terpisah.

### A-04. Persist dan refresh

1. Saat ada perubahan banner, validasi konfigurasi empat key sebagai satu unit dan simpan perubahan relevan dalam satu operasi yang konsisten. Jangan mengumumkan sukses bila write gagal.
2. Pertahankan authorization, public filtering dan audit settings existing. Jangan menampilkan isi file atau credential dalam audit.
3. Save/reset berhasil menginvalidasi settings admin dan root loader. Bedakan kegagalan menyimpan dari kegagalan refresh setelah nilai sudah tersimpan; jangan melakukan write ulang tanpa kebutuhan.
4. Jangan mereset draft edit yang belum disimpan hanya karena query lain selesai/refetch; sinkronisasi draft harus mempertahankan error/retry yang jujur.
5. Fresh SSR/read mendapat saved value. Tab pengunjung lama tidak dijanjikan update realtime; reload/request berikutnya cukup.
6. Reset Branding harus mencakup default banner dengan permission reset existing; jangan mengubah permission reset seluruh aplikasi.

### A-05. Renderer dan preview

1. Reuse satu renderer banner kecil untuk home dan preview; form behavior home tetap submit q.trim() ke /produk, maxLength 80.
2. Layer picture/img dekoratif menggunakan cover/object-position; mobile source opsional melalui media native. Hindari download dua variant/preload ganda tanpa kebutuhan.
3. Tidak lazy-load gambar di atas fold. fetchPriority high hanya bila evidence menunjukkan kandidat LCP, bukan pada semua gambar.
4. Image error menyembunyikan layer gambar/ruang khusus dan mengembalikan panel netral. URL baru memungkinkan retry normal; tidak ada loop retry untuk URL gagal. Mobile gagal memakai aset utama bila berbeda, lalu panel netral bila utama gagal, dengan fallback terbatas.
5. Preview menampilkan draft dengan label jelas. Gunakan renderer visual yang sama, tetapi jangan menyajikan tombol/form inert sebagai aksi nyata: tampilkan kontrol preview sebagai disabled/noninteractive secara eksplisit atau gunakan navigasi sebenarnya. Tidak menaruh form di dalam form admin.
6. Jaga backing solid, gambar tetap terlihat, nav strip, target minimal 44px, focus ring, mobile reflow dan dua tema. Jangan membuat teks langsung di atas foto tanpa evidence kontras.
7. Gambar owner tidak tersedia berarti fallback netral. Tidak membuat/mengunggah gambar production sebagai pengganti tanpa otorisasi.

### A-06. Acceptance dan evidence

Jalankan pemeriksaan yang diizinkan; setiap PASS mempunyai log/assert/hasil nyata.

- Config: default kosong/50, URL valid, URL malformed/encoded/traversal/external ditolak, posisi negative/>100/NaN/Infinity/string invalid ditolak server.
- Upload: ukuran/format/signature/decode/dimensi invalid ditolak; unauthorized upload/save/MCP/direct storage ditolak sesuai kontrak final. Tidak menyebut test mock sebagai bukti RLS live.
- Persist: upload tanpa save/batal tidak mengubah publik; save failure mempertahankan saved value; save sukses menyimpan konfigurasi konsisten; reset/clear memberi panel netral; audit tercatat sesuai jalur yang diuji.
- Cache: pergantian gambar memberi path UUID baru; root loader invalidate dan fresh SSR membaca pointer baru. Tidak purge cache global.
- Render: main/mobile/fallback, 404, utama kosong + mobile terisi, setting malformed, satu banner, tidak ada nested link/form, no invented copy.
- Regression: q trim/maxLength, home/navbar search tetap, Katalog produk/Pesanan saya/Produk yang dibeli tetap berfungsi; kartu/katalog/layanan default tidak ikut berubah.
- Unit seluruh suite, scoped lint, build tanpa server, TypeScript dibanding baseline dengan exit status dicatat, HTTP GET existing bila tersedia. Tinggalkan runnable regression.
- Kontras text normal >=4.5:1, large text >=3:1 sesuai definisi WCAG, non-text/focus >=3:1; backing token diperiksa light/dark. Jangan menganggap opacity tertentu pasti cukup.
- Visual/interaction acceptance perlu 390px/768px/desktop, zoom 200%, kedua tema, gambar terang/gelap/ramai, crop/focus/keyboard, console/hydration, preview dan save behavior. Selama browser dilarang, catat BELUM DIVERIFIKASI, jangan klaim visual-approved atau membuka browser diam-diam.

Tidak perlu test end-to-end production write hanya untuk UI. Fixture test tidak memakai record/private asset production dan tidak diupload ke layanan eksternal.

### A-07. Rollback dan stop conditions

- Default key kosong mempertahankan panel netral sehingga registry addition tidak otomatis mengubah home.
- Banner dapat dinonaktifkan dengan mengosongkan gambar utama melalui save berizin. Jangan reset seluruh Branding untuk rollback banner saja.
- Rollback ke URL/posisi tersimpan sebelumnya hanya jika object masih tersedia; object lama tidak dihapus otomatis.
- Rollback source menyentuh diff banner saja, tidak menimpa revisi kartu/panel netral/navbar sebelumnya; tanpa git reset/force push.
- Bila ada storage migration terpisah yang kelak diotorisasi, rencana rollback-nya harus menghindari penghapusan bucket/object serta pelemahan permission.
- Hentikan aktivasi fitur bila trust boundary/izin storage tidak terbukti, decoder tidak tersedia, atau deployment belum diotorisasi. Laporkan blocker konkret, bukan memperluas pekerjaan menjadi refactor RBAC/asset pipeline seluruh aplikasi.

## O: Outputs

### Deliverable tahap sekarang

Dokumen framework ini, berdasarkan riset yang sudah dibaca. Source aplikasi, SQL, database dan settings tidak diubah pada tahap penulisan framework.

### Deliverable setelah implementasi diotorisasi

1. Banner background home yang dapat diatur melalui Branding, preview shared, fallback netral dan empat key scoped.
2. Upload/persist/serve dengan validasi dan permission yang benar-benar dibuktikan; blocker/deployment terpisah dinyatakan jika belum terpenuhi.
3. Regression runnable dan dokumen evidence docs/audit/<tanggal>-verifikasi-banner-background-home-custom.md, logs .zcode/home-banner-*.
4. Laporan file berubah, tests/build/lint/TypeScript, HTTP, kontras, batas visual dan deployment. Tidak menyebut source sudah live atau visual PASS tanpa pemeriksaan.

Definition of done implementasi: kontrak G dan acceptance source/runtime yang diizinkan terpenuhi, tidak ada perubahan di luar allowlist, tidak ada klaim palsu. Approval visual dan release production tetap gate terpisah bila belum dapat dijalankan dengan batas owner.

## Catatan implementasi (ditulis sebelum file baru dibuat)

Preflight live pada 2026-10-03 ([evidence](../audit/2026-10-03-verifikasi-banner-background-home-custom.md)) menemukan bucket `catalog-images` belum ada, policy `catalog-images` masih `is_staff`, writer settings `is_admin`, dan tidak ada decoder JPEG/WebP/AVIF. Owner menyetujui lanjut dengan otorisasi dependency decoder dan migration scoped. Keputusan konkret:

- Path renderer shared: `src/components/home/banner-background.tsx`. Path modul server upload/validasi: `src/lib/banner-upload.server.ts`.
- Migration: `supabase/migrations/20261003090000_home_banner_branding.sql`. Isi: buat bucket `catalog-images` (private, 5 MB, MIME gambar) mengikuti preseden `payment-proofs`; seed permission `settings.branding.update` (super_admin saja, tanpa pelebaran role lain); trigger guard `system_settings` untuk key `home_banner_%` yang menuntut `has_permission(...,'settings.branding.update')` atau service role, menutup direct-DB writer `is_admin`. Tidak ada policy storage baru: upload banner lewat server function (service role), bukan RLS klien.
- Bucket dibuat private; serve tetap via `/api/public/catalog-image/*` dengan `nosniff` ditambahkan.
- Decoder: `sharp` (satu dependency baru, diotorisasi owner). Ceiling: input 3 MB, dimensi per sisi maksimal 8000 px, maksimal 16 MP (alasan: section home maksimal sekitar 1152 px, 2x retina membutuhkan sekitar 2300 px; 16 MP membatasi memori decode). Animated (pages > 1) ditolak.
- Upload banner lewat server function `uploadBannerImage` (permission `settings.branding.update`), bukan upload klien langsung; ImageUploader mendapat opsi `uploadRemote` opt-in.
