<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Catatan pembaruan

Sebelum commit dan push ke GitHub, catat perubahan yang selesai di `CHANGELOG.md`. Tulis apa yang diubah, alasan, hasil verifikasi yang benar-benar dijalankan, dan status deploy bila relevan. Sertakan catatan bersama file yang berkaitan dengan pembaruan tersebut. Pastikan diff yang akan dipush bersih dari kredensial dan konfigurasi privat.

## Deploy

Urutan wajib setiap rilis — jangan dilewati atau dibalik:

1. Build (`$env:NITRO_PRESET='node-server'; npm run build`).
2. Commit lalu push ke GitHub `main` (tanpa force push). **Jangan deploy kode yang belum ada di GitHub.**
3. Baru deploy ke VPS produksi **43.156.83.235**, user SSH **ubuntu**, app dir `/srv/ebrystore/app`:
   - `python .zcode/upload-tar-pw.py` → `.output.new`
   - pindahkan ke `/srv/ebrystore/releases/<nama>-YYYYMMDD-NN/.output`, `chown -R ebrystore:ebrystore`
   - `ln -sfn <rilis>/.output /srv/ebrystore/app/.output && systemctl restart ebrystore`
   - verifikasi `curl 127.0.0.1:3000` dan `https://app.ebrystore.my.id`.

VPS lama (172.235.167.29, 172.233.47.78, 95.111.194.57) sudah tidak dipakai.

### Akses SSH VPS

- Utamakan kunci SSH yang sudah diotorisasi untuk akun `ubuntu`. Jaga private key di perangkat lokal atau SSH agent.
- Jangan minta, kirim ulang, atau simpan password VPS lewat chat, file proyek, skrip, log, atau GitHub. Jika akses dengan password masih diperlukan, pemilik memasukkannya sendiri lewat prompt SSH atau menyediakannya sementara sebagai `$env:VPS_PW` di sesi PowerShell yang menjalankan deploy, tanpa mencetak nilainya.
- Jika login ditolak, laporkan statusnya. Pulihkan akses lewat konsol provider VPS atau otorisasi public key yang sesuai. Jangan meminta password di chat untuk melanjutkan deploy.

## Modern Web Guidance

Gunakan `modern-web-guidance` sebagai rujukan teknis sebelum menentukan solusi atau evaluasi untuk HTML, CSS, DOM, JavaScript client, React UI, browser API, layout responsif, form, aksesibilitas, keamanan browser, dan performa web. Untuk tugas campuran, terapkan pada bagian web platform. Lewati untuk backend, database, infrastruktur, Git, tooling, dan dokumentasi yang tidak menyentuh web platform.

1. Dari root repo, baca seluruh `.agents/skills/modern-web-guidance/SKILL.md`, ambil nilai `--skill-version` dari file tersebut, dan pastikan CLI dapat berjalan. Laporkan jika skill atau CLI tidak tersedia.
2. Jalankan `npx.cmd -y modern-web-guidance@latest search "<query>" --skill-version "<SKILL_VERSION>"` di PowerShell, atau gunakan `pnpx` sesuai upstream jika tersedia. Gunakan satu kueri bahasa Inggris sepanjang 2–5 kata per kemampuan, tanpa nama framework atau halaman proyek.
3. Pilih berdasarkan deskripsi hasil, lalu jalankan `npx.cmd -y modern-web-guidance@latest retrieve "<GUIDE_ID>"` untuk ID spesifik dan panduan disiplin yang relevan dari hasil. Baca keluaran penuh, termasuk jika ditulis ke file sementara. Jika hasil lemah, coba satu kueri dengan nama elemen atau pola yang lebih konkret. Gunakan `list` sekali bila diperlukan. Jika tetap tidak ada kecocokan, pakai dokumentasi resmi dan laporkan bahwa tidak ada panduan yang cocok.
4. Periksa implementasi aktual. Sesuaikan panduan dengan React, TanStack Start, SSR, hydration, serta komponen dan token desain yang ada. Gunakan browser API pada sisi client yang tepat. Prioritaskan Baseline Widely Available dan ikuti kebijakan browser proyek serta fallback panduan untuk dukungan yang terbatas. Pertahankan pengalaman dasar saat fitur tidak tersedia. Fitur eksperimental atau Origin Trial memerlukan persetujuan.
5. Verifikasi terhadap panduan dan kebutuhan tugas. Uji SSR/hydration, fallback, aksesibilitas, perilaku responsif, dan regresi sesuai cakupan. Klaim peningkatan Core Web Vitals harus didukung pengukuran. Ikuti format `### Modern Web Guidance` di `SKILL.md` untuk melaporkan tiap ID yang benar-benar diterapkan, keputusan teknis, dan kutipan pendek. Jika hanya mencari, sebutkan topik dan alasannya dalam satu kalimat.

Gunakan `legacy-scan` hanya atas permintaan audit web platform yang luas. Izin audit dan izin implementasi modernisasi mengikuti permintaan pengguna. Pertahankan perubahan lokal, arsitektur dan kontrak aplikasi, identitas visual, serta konfigurasi produksi. Batasi diff pada kebutuhan tugas.
