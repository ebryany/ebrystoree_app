# Riset banner background home yang bisa dikustom

Tanggal: 2026-10-02. Status: riset source dan referensi, bukan implementasi. Permintaan owner: mengganti gambar melalui pengaturan sehingga background section pencarian home berubah sesuai gambar tersebut. Bukan banner terpisah, slider promosi, atau penggantian warna seluruh website.

## Kesimpulan

Fitur paling sesuai ialah satu background banner pada MarketplaceDiscovery, dikelola melalui Pengaturan Website admin. Gunakan registry/settings/storage existing, bukan CMS atau tabel banner baru. Gambar tetap dekoratif; judul, deskripsi, form pencarian, dan akses belanja tetap HTML yang bisa dibaca dan digunakan.

Mengganti gambar tidak berarti mengambil warna dominan gambar lalu mengubah tema. Background mengikuti aset yang dipilih admin, sedangkan input, tombol, teks dan focus mempertahankan token website. Saat gambar kosong/gagal, section kembali ke panel netral yang sekarang, bukan blok teal.

Hambatan bukan hanya memasang URL: preview harus sama dengan home, settings publik berasal dari root loader, upload harus benar-benar berizin, URL harus khusus aset gambar, gambar perlu fallback, pergantian aset harus memakai path baru agar cache tidak menampilkan gambar lama.

## 1. Fakta source saat riset

### Panel home belum membaca settings banner

src/routes/index.tsx:201, MarketplaceDiscovery mempunyai q lokal dan submitSearch yang menuju /produk dengan q.trim(). Section sekarang bg-card/text-foreground setelah koreksi owner. Judul dan deskripsi hardcoded, form maxLength 80, tombol Cari dan akses Katalog produk/Pesanan saya/Produk yang dibeli tersedia.

Tidak ada prop URL gambar, picture, background image, atau useWebsiteSettings pada panel. Mengunggah gambar di pengaturan existing tidak otomatis mengubah section ini.

### Settings bisa dipakai ulang, key banner belum ada

src/lib/website-settings.ts:174, bagian Branding berizin settings.branding.update berisi logo, logo gelap, favicon, square logo, OG image, warna accent dan background. Tidak ada key gambar background home. feature_promo_banner di registry merupakan boolean, bukan URL dan bukan bukti feature banner ter-render.

src/lib/website-settings.functions.ts:67, saveWebsiteSection memvalidasi key melalui FIELD_BY_KEY, memastikan key termasuk section, menjalankan permission guard, upsert system_settings, lalu audit. Key baru yang tidak didaftarkan akan ditolak.

src/lib/website-settings.server.ts:21, readPublicSettings mengambil is_public=true dan menyaring PUBLIC_KEYS. Fallback ketika gagal membaca ialah PUBLIC_DEFAULTS. Key harus masuk registry sebagai public agar sampai ke home; memasukkan row database saja tidak cukup.

src/routes/__root.tsx:90 memuat getPublicWebsiteSettings melalui root loader. src/hooks/use-website-settings.ts:6 membaca values root loader melalui useRouterState. Jalur ini SSR-safe dan lebih sesuai daripada query banner tambahan di home.

### Upload existing berguna, belum khusus banner

src/components/admin/image-uploader.tsx:9 menerima JPEG/PNG/WebP/AVIF, maksimum 3 MB di client, folder + UUID, upload catalog-images dengan upsert:false, lalu menghasilkan /api/public/catalog-image/<path>. Tombol Hapus hanya mengosongkan value, bukan menghapus object storage.

src/routes/_authenticated/admin/settings.website.tsx:334 memilih ImageUploader hanya untuk field url yang key-nya mengandung logo. Key banner baru bertipe url akan jatuh menjadi Input biasa tanpa perubahan pemilihan control. Uploader juga tidak menerima disabled, padahal FieldEditor mempunyai disabled; ini perlu diperhatikan agar editor tidak dapat mengunggah ketika permission/save state melarang.

MIME dan ukuran client berguna untuk UX, tetapi tidak membuktikan file aman. Ekstensi berasal dari nama file, bukan verifikasi isi; belum ada pemeriksaan signature/decode/dimensi dalam uploader ini.

### Route aset dan cache perlu dipertahankan dengan hati-hati

src/routes/api/public/catalog-image.$.tsx:6 menerima path sederhana, mengunduh catalog-images melalui client server privileged, menyajikan Content-Type blob dan cache public satu tahun immutable. Endpoint tidak melakukan permission check per pembaca karena aset memang dimaksudkan publik.

Implikasi: jangan menaruh data pribadi di bucket/prefix yang dapat dilayani endpoint ini. Path baru per upload cocok dengan immutable; overwrite path sama akan berisiko menampilkan gambar lama. Header dan batas MIME/dimensi harus tetap benar pada trust boundary, bukan hanya di browser.

### Preview admin sekarang bukan preview panel home

src/components/admin/settings-preview.tsx:6 menampilkan header/nav/tagline/deskripsi/CTA contoh menggunakan warna inline. Tidak memakai MarketplaceDiscovery atau layout form home. Menambahkan thumbnail saja tidak cukup: admin harus melihat hasil crop, area teks, pencarian dan nav yang benar-benar sama dengan home.

### Invalidation settings belum menyentuh sumber root loader secara eksplisit

src/routes/_authenticated/admin/settings.website.tsx:86, setelah save hanya invalidateQueries website-settings dan public-website-settings. Consumer publik sebenarnya membaca root loader; handler save ini tidak memanggil router.invalidate(). Karena itu invalidasi query saja tidak membuktikan tab yang sama langsung memakai background baru. Navigasi/refetch loader mungkin memuat ulang sesuai router lifecycle, tetapi belum diuji. Target implementasi: invalidate root loader setelah save sukses, tanpa polling atau realtime baru.

### Authorization storage lebih luas dibanding izin branding

supabase/migrations/20260728192359_bee704a8-f1a6-4cf6-9925-a8a0ad5ec467.sql:2 memperbolehkan insert/update/delete/select catalog-images berdasarkan is_staff, bukan settings.branding.update atau prefix branding. Definisi is_staff pada migration awal mencakup operator/support/finance/admin/super_admin.

system_settings mempunyai policy write is_admin pada supabase/migrations/20260728115920_fd20fac0-bfa9-4807-bfe8-3815af1b5588.sql:132. Guard permission server function tidak dengan sendirinya mempersempit akses SQL langsung atau object storage.

src/lib/mcp/tools/update-website-settings.ts:17 juga dapat menulis key registry melalui jalur MCP; ia melakukan authGuard, validateField dan upsert, tetapi tidak memanggil assertPermission section pada handler yang ditinjau. Batas downstream RLS tetap berlaku. Ini bukan bukti eksploit atau kondisi production, melainkan alasan semua writer harus disertakan dalam pemeriksaan key banner.

Pencarian migration lokal tidak menemukan deklarasi bucket catalog-images dengan file_size_limit/allowed_mime_types. Konfigurasi live tidak diperiksa. Jangan menyimpulkan bucket production tidak memiliki batas, atau mengklaim kebijakan live sama dengan source.

## 2. Bentuk tampilan yang direkomendasikan

Satu section existing, bukan section baru:

1. Background image mengisi section melalui layer dekoratif di belakang konten, pointer-events:none, tanpa menjadikan banner link.
2. Judul, deskripsi, search input dan tombol tetap HTML di atasnya.
3. Area teks/form menggunakan backing netral solid yang terbatas pada area konten, bukan menutupi seluruh background. Gambar masih tampak pada ruang samping/margin dan area yang memang disediakan. Ini menjaga keterbacaan pada foto terang, gelap, ramai, atau gambar berbeda setelah update.
4. Akses belanja tetap berada di section yang sama, pada strip netral/divider yang terbaca. Background section berubah tetapi link tidak ditulis ke dalam gambar.
5. Mobile memakai layout konten yang reflow, bukan tinggi tetap yang memotong form. Gambar dekoratif boleh ter-crop; input dan link tidak boleh ter-crop.

Owner meminta background yang terlihat, sehingga preview perlu memastikan gambar tidak seluruhnya tertutup backing netral. Area gambar desktop/mobile harus ditentukan pada framework implementasi dan diverifikasi visual. Jangan mengecilkan input atau menjadikan judul sangat besar demi menampakkan gambar.

Alternatif teks langsung di atas gambar membutuhkan scrim dan pengukuran kontras area terburuk untuk setiap aset, posisi, breakpoint dan tema. Persentase overlay tertentu tidak otomatis menjamin WCAG. Untuk versi awal, backing solid lebih aman daripada kontrol warna teks/opacity bebas atau analisis warna otomatis.

Tidak ada gradient teal, glow, carousel, autoplay, ikon dekoratif baru, atau copy promosi rekaan. Gambar dari owner, tidak dibuat/dicari lalu dipublish tanpa izin.

## 3. Konfigurasi minimum

Usulan key, belum ditambahkan:

| Key | Tipe | Default | Fungsi |
| --- | --- | --- | --- |
| home_banner_image_url | asset URL | kosong | Background utama desktop dan fallback mobile |
| home_banner_mobile_image_url | asset URL opsional | kosong | Komposisi mobile bila gambar desktop kurang sesuai |
| home_banner_position_x | integer 0..100 | 50 | Titik fokus horizontal |
| home_banner_position_y | integer 0..100 | 50 | Titik fokus vertikal |

Tempatkan kelompok Banner home di section Branding existing, tetap menggunakan settings.branding.update. URL kosong menonaktifkan background; tidak perlu feature flag/tabel/scheduler baru. Versi pertama mempertahankan copy existing. Judul/deskripsi/CTA editor, dark-image khusus, kontrol warna/overlay bebas, jadwal dan multi-banner tidak dibutuhkan untuk permintaan ini.

ImageUploader dan validator asset harus dipilih eksplisit, bukan menggunakan substring logo sebagai satu-satunya penentu. Pengaturan focal point bukan editor crop baru; gunakan object-position atau background-position native. Kalau dua aset belum diperlukan, field mobile tetap opsional.

## 4. Alur admin dan pembaca

1. Admin berizin membuka Pengaturan Website > Branding > Banner home.
2. Admin memilih gambar utama, opsional mobile, mengatur posisi, melihat preview desktop/mobile yang menggunakan render banner home yang sama.
3. Upload berhasil hanya mengubah draft. Label harus membedakan “berhasil diunggah” dari “sudah tampil di home”.
4. Simpan memvalidasi seluruh nilai dan menyimpan pointer URL/posisi bersama. Error upload/save mempertahankan banner publik lama dan draft untuk retry.
5. Save sukses menginvalidasi settings admin serta root loader. Home baru memakai URL baru; fresh SSR harus mendapatkan setting tersimpan.
6. Pengunjung melihat gambar baru pada request/reload berikutnya. Tab pengunjung yang sudah terbuka tidak dijanjikan update live tanpa reload. Tidak menambah realtime/polling.
7. Hapus background lalu Simpan mengosongkan pointer dan mengembalikan panel netral. Gambar lama tidak otomatis dihapus saat draft berubah, sebab masih mungkin dipakai halaman aktif atau rollback.
8. Batal draft tidak mengubah banner publik. Upload draft yang dibatalkan mungkin meninggalkan object tak direferensikan; cleanup membutuhkan aturan retention dan evidence tersendiri, bukan penghapusan otomatis tanpa pemeriksaan.

## 5. Gambar, crop dan performa

- Cover memenuhi container sambil menjaga rasio, tetapi memotong gambar ketika rasio berbeda. Contain menampilkan semua isi tetapi meninggalkan ruang kosong. Untuk background dekoratif gunakan cover dan focal point; bukan contain kartu produk yang mempunyai tujuan berbeda.
- Gunakan gambar tanpa teks penting/logonya tertanam. Promosi/legal/informasi produk tidak boleh hanya tersedia pada bitmap background.
- Panduan awal ekspor: desktop sekitar 1600 x 600, mobile opsional sekitar 900 x 1000; sesuaikan dengan ukuran section akhir. Ini usulan proyek, bukan standar wajib atau ukuran final yang sudah diukur.
- Target payload awal <=500 KB desktop dan <=250 KB mobile; batas keras <=3 MB mengikuti ceiling uploader existing. Target tersebut budget proyek, bukan klaim peningkatan performa. WebP/AVIF cocok bila tooling existing dapat memverifikasi; JPEG/PNG tetap didukung.
- Rekomendasikan picture/img absolut alt="" sebagai layer background visual karena native loading/error/srcset/media tersedia. CSS background juga mungkin tetapi penanganan kegagalan dan discovery resource perlu perhatian. Tampilan background tidak harus diimplementasikan dengan properti CSS background-image.
- Hero di atas fold jangan memakai lazy load bila merupakan kandidat LCP. fetchPriority high hanya bila asset tersebut benar-benar kandidat kritis; tidak memberi high ke semua gambar. Hindari preload ganda desktop+mobile dan jangan memuat kedua variant tanpa kebutuhan.
- Tetapkan ukuran/rasio layer gambar, biarkan section ditentukan konten agar loading gambar tidak menggeser input/link. Fallback tetap background netral sebelum/gagal load.
- Path UUID baru dan upsert:false dipertahankan. Endpoint sekarang mengambil blob dan mengubahnya menjadi arrayBuffer; batas file penting agar respons besar tidak menaikkan penggunaan memori tanpa perlu.

## 6. Validasi dan keamanan wajib

1. Key dan nilai divalidasi server-side. Posisi finite/integer/range; URL asset dibatasi path same-origin /api/public/catalog-image/branding/home/... yang aman, bukan URL navigation umum.
2. isSafeUrl existing menerima mailto/http dan path yang diawali slash, termasuk protocol-relative. Validator umum tersebut belum cocok untuk background image. Tolak javascript/data/file/mailto, //host, traversal, path asing, external URL arbitrary dan input CSS mentah. Jangan membuat server fetch URL pengguna.
3. Uploader client hanya UX. Server/storage harus menegakkan ukuran, allowlist MIME/ext, signature sesuai format dan pemeriksaan decode/dimensi yang dibatasi. Jangan mengandalkan file.type atau signature saja. SVG/HTML/animated format tidak termasuk kebutuhan ini.
4. Periksa permission branding pada upload, save, remove dan writer alternatif. UI disabled tidak menggantikan server authorization. Path baru harus tidak dapat ditimpa/dihapus oleh staff tanpa izin banner.
5. Jangan mempersempit seluruh catalog-images secara blanket karena upload produk/layanan existing dapat bergantung pada policy staff. Bila policy prefix khusus dibutuhkan, audit policy permissive existing: policy baru yang lebih ketat tidak membatasi policy lama yang masih mengizinkan operasi. Perubahan SQL/storage memerlukan scope framework eksplisit dan pemeriksaan live sebelum penerapan.
6. Endpoint publik hanya untuk aset publik; MIME response dan nosniff perlu diperiksa pada jalur aset banner. Upload gagal/invalid tidak boleh menjadi pointer tersimpan.
7. Read fallback harus tahan setting malformed yang mungkin datang dari direct database write, bukan hanya key dikenal. coerce existing tidak menjalankan validateField terhadap nilai tersimpan.
8. Audit perubahan pointer/posisi, bukan isi file/credential. Jangan menaruh gambar pribadi atau record production ke repo.

## 7. Scope implementasi yang layak disusun berikutnya

Scope inti: renderer MarketplaceDiscovery, registry/validator banner, field editor/uploader banner, preview yang memakai renderer sama, invalidasi root loader setelah save, tests. Reuse source existing; komponen shared kecil hanya bila diperlukan agar preview dan home tidak mempunyai dua layout berbeda.

Allowlist calon, belum izin edit:
- src/routes/index.tsx, hanya wiring/render MarketplaceDiscovery.
- src/lib/website-settings.ts dan writer/read settings yang memang perlu validasi banner.
- src/routes/_authenticated/admin/settings.website.tsx, hanya control banner dan invalidasi root loader.
- src/components/admin/settings-preview.tsx dan image-uploader.tsx, perubahan kompatibel atau uploader khusus sekecil mungkin.
- src/hooks/use-website-settings.ts hanya bila bukti membutuhkan perubahan; default jalur existing cukup.
- Jalur aset/upload/policy khusus banner hanya setelah audit storage membuktikan perubahan yang diperlukan dan framework menyatakannya eksplisit.
- Tests banner dan dokumen/evidence terkait.

Tidak termasuk redesign navbar/footer/kartu produk/katalog, jasa seller, rekber/checkout, global theme, CMS, carousel, marketplace seller banner, penghapusan massal aset atau perbaikan permission seluruh aplikasi.

Belum ada migration atau production change yang dapat ditetapkan hanya dari source. Framework MGRCAO V3 implementasi harus ditulis sebelum edit berikutnya, memakai dokumen ini sebagai konteks; riset ini tidak menjalankan implementasi otomatis.

## 8. Acceptance yang diperlukan

- Empty/default: home identik dengan panel netral; pencarian navbar dan home tetap ada.
- Desktop/mobile asset: background benar-benar terlihat, focal point bekerja, cover crop tidak memotong UI; optional mobile memakai fallback desktop jika kosong.
- Terang/gelap/ramai: judul/deskripsi/link/input tetap kontras, kedua tema, 390px/768px/desktop, zoom 200%, keyboard/focus dan reduced motion.
- Image 404/timeout/invalid: panel netral tetap usable, tidak ada broken image yang menutup form, tidak ada loop retry.
- Preview draft tidak mengubah publik; save success/failed/reset konsisten; root loader dan fresh SSR memakai saved value.
- UUID baru mengubah URL; cache immutable tidak menghasilkan stale asset karena overwrite. Tidak perlu purge cache global.
- No-permission/anon/customer/operator tanpa izin: upload/save/update/delete ditolak server/storage, bukan hanya button disabled. Uji writer MCP/direct storage sesuai kebijakan final.
- Invalid type/size/signature/path/position ditolak; file lama dan banner tersimpan tetap tersedia jika gagal.
- Form q trim/maxLength tetap, semua tiga akses belanja menuju route existing, satu banner saja, tidak menggandakan search baru.
- Build/unit/lint/HTTP bukan screenshot/GUI acceptance. Visual dan interaksi tetap belum diuji selama larangan browser owner berlaku.

## 9. Referensi eksternal

Referensi diambil melalui HTTP GET tanpa browser pada sesi ini. WebFetch W3C gagal; curl berhasil untuk kelima sumber. Snapshot lokal .zcode/home-card-research-*.html dan excerpts.txt hanya evidence riset, bukan aset UI.

1. [W3C WCAG 2.2, Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text >=4.5:1, large text >=3:1; background image yang tidak memberi kontras cukup termasuk failure F83. Rekomendasi backing solid proyek berasal dari kebutuhan menerima aset arbitrary, bukan klaim semua overlay gagal.
2. [MDN, background-size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-size): cover menjaga rasio dan dapat crop; contain tidak crop/stretch tetapi tidak selalu mengisi container. Background-color tetap fallback/transparency backing.
3. [web.dev, Optimize resource loading with the Fetch Priority API](https://web.dev/articles/fetch-priority): priority merupakan hint; resource kritis/background perlu discovery awal, lazy untuk konten below fold. Tidak menjamin skor performa tertentu.
4. [OWASP, File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): Content-Type pengguna tidak terpercaya, gunakan allowlist/ext/signature dengan lapisan validasi, ukuran, nama aplikasi dan authorization.
5. [Supabase, Standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads): overwrite dapat menimbulkan cache stale; path baru direkomendasikan. Small file upload existing cukup untuk ceiling 3 MB; tidak perlu dependency resumable upload baru.

## Batas hasil

Riset menghasilkan rekomendasi arsitektur dan acceptance, bukan bukti banner telah tersedia di admin/home. Tidak mengubah aplikasi, SQL, database atau settings selama riset ini. Revisi kartu home/panel netral sebelumnya telah divalidasi tersendiri pada 2026-10-02-verifikasi-kartu-home-dan-panel-netral.md: 165 unit test dan build PASS, TypeScript captured baseline 70, visual belum diverifikasi.
