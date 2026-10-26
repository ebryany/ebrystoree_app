# Verifikasi Fase 2 & 3: Dashboard Pertumbuhan (Marketing, Konten, SEO)

Tanggal: 2026-10-05 · Rencana: [`../marketplace/11-rencana-mgrcao-v3-dashboard-marketing-konten-seo.md`](../marketplace/11-rencana-mgrcao-v3-dashboard-marketing-konten-seo.md)
Framework: [`../marketplace/10-framework-prompt-dashboard-marketing-konten-seo.md`](../marketplace/10-framework-prompt-dashboard-marketing-konten-seo.md)
Status: **FASE 2 & 3 SELESAI — DEPLOYED & VERIFIED DI PRODUKSI**

---

## 1. Halaman dashboard (jawaban pertanyaan "halamannya apa?")

**Satu dashboard, 5 menu** dalam grup "Pertumbuhan" di sidebar admin:

| Menu | URL | Menjawab |
|---|---|---|
| Ringkasan | `/admin/pertumbuhan` | Ada trafik? Ada penjualan? Kondisi konten/SEO/kampanye? |
| Marketing | `/admin/pertumbuhan/marketing` | Dari mana pengunjung? Halaman mana populer? Di mana berhenti? |
| Konten | `/admin/pertumbuhan/konten` | Konten apa yang dikerjakan? Mana yang performanya bagus? Siapa menulis apa? |
| SEO | `/admin/pertumbuhan/seo` | Halaman mana bermasalah? Masalah apa paling sering? |
| Kampanye | `/admin/pertumbuhan/kampanye` | Kanal mana menghasilkan order? Kampanye mana jalan? |

Gaya visual memakai komponen dan token yang sama dengan dashboard admin
(`AdminPageHeader`, `ForbiddenState`, pola `adminNav`), sesuai keputusan Owner.

---

## 2. Yang dikerjakan Fase 2

### 2.1 SEO audit on-page

| Item | Status |
|---|---|
| Tabel `seo_audit_results` + 2 fungsi | TERPASANG |
| Pemeriksa `seo-audit.server.ts` (7 jenis aturan) | SELESAI |
| Server fn: `runSeoAuditNow`, `getSeoAudit` | SELESAI |
| Test unit | **11/11 LULUS** |

### 2.2 Alur editorial konten

| Item | Status |
|---|---|
| Status diperluas: `idea, outline, draft, review, ready, scheduled, published, archived` | TERPASANG (aditif) |
| Tabel `article_status_history` | TERPASANG |
| RPC `set_article_status` (transisi + riwayat satu transaksi) | SELESAI |
| RPC `content_summary` (ringkasan per status/penulis) | SELESAI |

**Hasil uji DB:** transisi `draft → review → ready → published` tercatat dengan `from`
benar; `published_at` terisi otomatis; **status sama tidak mencatat riwayat palsu**;
status ngawur ditolak (`INVALID_STATUS`); non-staff ditolak (`FORBIDDEN`).

### 2.3 Kampanye & atribusi

| Item | Status |
|---|---|
| Tabel `campaigns` (UNIQUE utm_source + utm_campaign) | TERPASANG |
| RPC `upsert_campaign`, `list_campaigns`, `campaign_attribution` | SELESAI |
| UTM builder di panel Kampanye | SELESAI |

---

## 3. Cacat desain yang DITEMUKAN & DIPERBAIKI (penting)

### Masalah

Atribusi versi pertama mencari "sesi terakhir sebelum order dibuat" **tanpa
mengetahui siapa yang memesan**. Saat diuji, hasilnya salah: order pembeli
tercocokkan ke sesi acak milik orang lain yang kebetulan aktif sebelumnya.

Itu bukan atribusi, melainkan tebakan yang kebetulan terlihat seperti angka.

### Perbaikan

1. Kolom `user_id` ditambahkan ke `analytics_events`, diisi **hanya** saat
   permintaan membawa token login yang **diverifikasi server** (bukan dikirim klien).
2. `campaign_attribution` diubah: menghubungkan kampanye **milik pengguna yang sama**
   sebelum ordernya dibuat.

### Bukti perbaikan

Uji: pembeli melihat kampanye `instagram`, orang lain melihat `tiktok`.
Hasil: order pembeli → **`instagram`** (benar). Diverifikasi manual:
`sumber_order_pembeli: instagram`, dan kunjungan `tiktok` milik orang lain
**tidak mencemari** hasil.

**Privasi tetap terjaga:** pengunjung anonim hanya punya hash sesi harian; `user_id`
hanya untuk pengguna login, dan itu memang syarat atribusi yang benar.

---

## 4. Audit SEO produksi (temuan nyata)

Dijalankan terhadap `https://app.ebrystore.my.id`:

| Halaman | Temuan |
|---|---|
| `/` | SEHAT |
| `/produk` | title terlalu pendek (26), **canonical tidak ada** |
| `/layanan` | title terlalu pendek (23), **canonical tidak ada** |
| `/artikel` | **canonical tidak ada** |
| `/bantuan` | **canonical tidak ada** |
| `/syarat-ketentuan` | **canonical tidak ada** |
| `/kebijakan-privasi` | title terlalu pendek (27), **canonical tidak ada** |

**Total 9 temuan dari 7 halaman.** Ini masalah nyata yang bisa diperbaiki
(menambah canonical dan memperpanjang title) — bukan angka karangan.

---

## 5. Verifikasi produksi

| Cek | Hasil |
|---|---|
| App hidup | HTTP 200 |
| 6 halaman diakses (`/`, `/produk`, `/layanan`, `/artikel`, `/admin`, `/admin/pertumbuhan`) | semua **200** |
| **Error baru setelah akses halaman** | **0** (133 baris log, tidak bertambah) |
| Halaman Pertumbuhan render | ya (menampilkan "Memeriksa sesi" saat belum login — benar) |
| Admin tersedia untuk uji | `admin@ebrystore.com` (super_admin) |
| Izin `admin.dashboard.view` | dimiliki 5 peran |

Catatan: error `ERR_MODULE_NOT_FOUND` di log adalah **sisa historis** dari build
sebelumnya (merujuk nama file resolver lama `BTBI7_eH` yang sudah tidak ada).
Dibuktikan dengan uji bersih: 0 pertambahan baris log setelah mengakses 6 halaman.

---

## 6. Test & build

| Cek | Hasil |
|---|---|
| `seo-audit.test.ts` (baru) | **11/11 lulus** |
| `analytics-rules.test.ts` | 10/10 lulus |
| `npm run test:unit` | **472 lulus** / 483; 11 gagal = baseline lama `marketplace-home.test.tsx` |
| `npx tsc --noEmit` | 7 error tersisa, semuanya pra-ada |
| `npx eslint` file baru | 0 error |
| `npm run build` (node-server) | sukses, 706 file ter-deploy |
| Deploy VPS | sukses, `.env` dipertahankan otomatis |

---

## 7. Catatan jujur

1. **Dashboard belum diuji dengan login sungguhan.** Verifikasi produksi memastikan
   halaman merespons 200 dan tidak error, tapi tampilan penuh setelah login belum
   saya lihat langsung (butuh kredensial admin). Ini perlu Anda cek sendiri.
2. **Panel Marketing/Konten/Kampanye akan tampil kosong** karena data produksi
   masih sedikit (0 artikel, analytics baru mulai). Itu **benar** — keadaan kosong
   menjelaskan cara mengisinya, bukan menampilkan angka palsu.
3. **`payment_success` memakai penanda sesi `server`**, jadi tidak dihitung sebagai
   pengunjung unik. Batas ini sudah ditulis di dokumen definisi metrik.
4. **Peringkat keyword & trafik pencarian tidak ada** — butuh Search Console API.
   Panel SEO menyatakan batas ini secara terbuka, bukan menampilkan angka kosong.
5. **Audit SEO belum dijalankan otomatis** (belum ada cron); saat ini dipicu manual
   dari panel. Menambah cron itu pekerjaan kecil bila diinginkan.
6. **Kunjungan staf sendiri belum dikecualikan** dari metrik.

---

## 8. Yang belum dikerjakan (jujur)

| Item | Status |
|---|---|
| Cron audit SEO otomatis | BELUM (dipicu manual) |
| Kalender konten visual | BELUM (board status sudah ada) |
| Checklist pra-terbit di UI | Kolom `checklist` sudah ada di DB, UI belum |
| Integrasi Search Console | BELUM (keputusan Owner) |
| Media library | BELUM (di luar scope Fase 1-3) |
| Uji login sungguhan di produksi | BELUM (butuh kredensial) |
