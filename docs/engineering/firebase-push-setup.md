# Panduan Setup Firebase Push Realtime & Worker Khusus EBRYSTORE

Dokumen ini menjelaskan penempatan khusus backend Firebase Push di VPS EBRYSTORE (`43.156.83.235`) serta integrasi `google-services.json` di proyek Android native (`id.my.ebrystore.app`).

## Arsitektur Terisolasi ("Kombinasi Mematikan")

1. **Sumber kebenaran tunggal tetap di Supabase Postgres**: semua akun, pesanan, pembayaran, saldo, notifikasi, dan chat (`product_inquiries` & `product_inquiry_messages`) tetap sinkron 100% antara Web dan Android.
2. **Firebase hanya sebagai jalur kirim push (FCM HTTP v1)** dan ditempatkan secara khusus:
   - Kode terisolasi penuh di `src/services/firebase-push/`.
   - Di VPS, berjalan sebagai daemon terpisah (`ebrystore-push-worker.service`) dengan file kredensial terpisah (`/etc/ebrystore/firebase-push.env`, `chmod 640`). Jika Firebase bermasalah, web & API utama (`ebrystore` port 3000 & `ebrystore-worker2` port 3001) tidak terdampak.
3. **Dual-layer Realtime + Interaktif di Android**:
   - **Saat aplikasi dibuka (foreground)**: Supabase Realtime WebSocket menangani live chat & live badge + banner interaktif di dalam aplikasi; jika pengguna sedang membuka thread chat yang sama, notifikasi system-tray untuk thread itu disenyapkan otomatis.
   - **Saat aplikasi di background / layar mati**: Worker khusus mengirim High-Priority Data Push via FCM HTTP v1 sehingga Android selalu membangunkan `EbryFirebaseMessagingService` untuk menampilkan `MessagingStyle` + **Balas Langsung (Direct Reply)**, **Tandai Dibaca**, dan **Lihat Pesanan**.

---

## Langkah 1: Buat Project Firebase & Ambil 2 File Kredensial

1. Buka [Firebase Console](https://console.firebase.google.com/) lalu buat project baru (misal `ebrystore-prod`).
2. **Untuk Android (`google-services.json`)**:
   - Pilih **Add app -> Android**.
   - Isi Android package name persis: `id.my.ebrystore.app`.
   - Unduh `google-services.json` lalu simpan di:
     `C:\Users\febry\Documents\ebrystore-android\app\google-services.json`
   - Plugin `com.google.gms.google-services` di `app/build.gradle.kts` akan otomatis aktif saat file tersebut ada, lalu build ulang APK (`assembleDirectPerf`).
   - **Jangan commit `google-services.json` ke repositori publik.**
3. **Untuk VPS Worker (`firebase-service-account.json`)**:
   - Di Firebase Console -> **Project Settings -> Service accounts -> Generate new private key**.
   - Unduh file JSON tersebut (jangan pernah simpan di repo Git!).

---

## Langkah 2: Terapkan Migrasi Tabel Push di Supabase (Memerlukan Persetujuan Pemilik)

Jalankan kedua migrasi aditif & idempoten berikut di Supabase SQL Editor (atau `supabase db push`):
1. `supabase/migrations/20261127060000_mobile_push_tokens.sql` (`user_push_tokens` + `push_dispatch_log`)
2. `supabase/migrations/20261127090000_push_preferences_and_chat_events.sql` (kolom `push_preferences` + `event_key` dedupe per pesan chat)

---

## Langkah 3: Pasang Worker Terisolasi di VPS (`43.156.83.235`)

1. Build bundle worker khusus:
   ```powershell
   npm run build:push-worker
   ```
   Output: `dist/push-worker/firebase-push-worker.mjs`.

2. Di VPS, buat direktori terisolasi & simpan kredensial Firebase dengan izin ketat:
   ```bash
   sudo mkdir -p /etc/ebrystore /srv/ebrystore/push-worker
   # Upload firebase-service-account.json ke /etc/ebrystore/firebase-service-account.json
   # Upload dist/push-worker/firebase-push-worker.mjs ke /srv/ebrystore/push-worker/firebase-push-worker.mjs
   sudo cp /srv/ebrystore/app/deploy/firebase-push.env.example /etc/ebrystore/firebase-push.env
   sudo chown -R root:ebrystore /etc/ebrystore
   sudo chmod 640 /etc/ebrystore/firebase-push.env /etc/ebrystore/firebase-service-account.json
   sudo chown -R ebrystore:ebrystore /srv/ebrystore/push-worker
   ```

3. Pasang & aktifkan service systemd terpisah:
   ```bash
   sudo cp /srv/ebrystore/app/deploy/ebrystore-push-worker.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now ebrystore-push-worker
   sudo journalctl -u ebrystore-push-worker -n 30 --no-pager
   ```
   Log sukses akan menampilkan `"event":"fcm_configured"` dan `"event":"realtime_channel_status","status":"SUBSCRIBED"`.
