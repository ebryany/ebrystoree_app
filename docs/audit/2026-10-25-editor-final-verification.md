# Storefront Editor — Final Verification Report

Tanggal: 25 Oktober 2026 · Mode: targeted verification · Tidak ada perubahan pada homepage/katalog/checkout/DB/RLS

---

## Ringkasan keputusan

**Status: READY WITH ONE BLOCKER** — editor siap secara fungsional dan aman terhadap cross-seller, tetapi satu temuan lama (kolom privat `stores` terbuka ke anon) masih terbuka karena migrasinya belum diterapkan ke database.

---

## D. Baseline 9 test gagal — VERIFIED pre-existing

Bukan asumsi. Bukti:

| String yang diharapkan test | Ada di test | Ada di homepage | Ada di /layanan |
|---|---|---|---|
| `"Layanan dari platform"` | ✅ | ✅ (tapi hanya bila ada paket aktif) | ❌ |
| `"Belum ada layanan tersedia."` | ✅ | **❌ tidak pernah ada** | ✅ |

**Akar:** `PlatformServicesSection` sengaja `return null` saat katalog kosong (komentar kode menjelaskan keputusan itu). Test mengharapkan homepage menampilkan empty state platform services — perilaku yang **tidak pernah** diimplementasikan di homepage.

Bukti tambahan: `src/components/home/sections.tsx` (berisi logika section terkait) bertanggal **29 Sep**, tidak pernah disentuh dalam seluruh sesi ini.

**Kesimpulan:** 9 kegagalan adalah test yang mengunci perilaku lama. **Tidak ada regresi baru.** Tidak saya perbaiki karena di luar scope (menyentuh test homepage) dan keputusan produk "sembunyikan section kosong" sudah benar.

---

## B. Preview & Upload Lifecycle — 4 BUG DITEMUKAN & DIPERBAIKI

Verifikasi ini menemukan bug nyata yang tidak terlihat dari build sukses.

### BUG 1 — Simpan tidak diblokir saat upload berjalan (HIGH)
`disabled` hanya cek `mutation.isPending`. Seller bisa klik Simpan saat upload masih jalan → `logoUrl` berisi `blob:http://...` terkirim ke server → ditolak validasi atau tersimpan URL mati.

**Fix:** `disabled` kini juga cek `uploading !== null` **dan** menolak draft yang masih berisi `blob:`. Label tombol menjadi "Menunggu unggahan…".

### BUG 2 — Upload selesai setelah editor ditutup menghidupkan draft zombie (HIGH)
`onDraftChange` dipanggil tanpa cek mounted. Tutup editor saat upload → draft dibuang → upload selesai → `setDraft(...)` menghidupkan kembali draft → header menampilkan "Pratinjau" padahal editor tertutup.

**Fix:** `mountedRef` + `uploadToken` per jenis aset. Hasil async yang terlambat diabaikan sepenuhnya dan object URL-nya di-revoke.

### BUG 3 — Stale closure menghapus input pengguna (MEDIUM-HIGH)
`onDraftChange({ ...draft, [urlField]: result.url })` memakai `draft` dari closure saat upload dimulai. Ketik nama toko selama upload → nama hilang saat upload selesai.

**Fix:** `patchDraft()` memakai functional updater `(prev) => ({ ...prev, ...patch })`.

### BUG 4 — Efek samping di dalam state updater (LOW-MEDIUM)
`URL.revokeObjectURL` dipanggil di dalam `setLocalPreview(p => ...)`. React 19 StrictMode memanggil updater dua kali; updater harus murni.

**Fix:** revoke dipindah ke luar updater.

### Verifikasi lifecycle
| Skenario | Status |
|---|---|
| Pilih gambar → pratinjau instan | ✅ `URL.createObjectURL` sebelum upload |
| Ganti gambar berkali-kali | ✅ token mencegah hasil lama menimpa |
| Batal | ✅ token di-increment, semua object URL di-revoke |
| Tutup saat upload | ✅ mountedRef mencegah zombie draft |
| Upload gagal | ✅ pratinjau kembali ke aset published |
| Save saat upload belum selesai | ✅ tombol disabled |

**Catatan jujur:** file yang sudah terlanjur terunggah ke Storage saat seller menekan Batal **tetap ada** (yatim). Bucket memakai path `stores/{id}/{kind}` dengan nama unik per unggahan, jadi tidak menimpa aset lama, tetapi tidak ada job pembersih. Ini keterbatasan yang saya laporkan, bukan bug yang saya perbaiki (butuh kebijakan retensi).

---

## C. Post-Save State Consistency

### BUG 5 — Refetch gagal membuat draft nyangkut (MEDIUM)
`await router.invalidate()` tanpa try/catch. Refetch gagal → promise reject → `setDraft(null)` tidak jalan → draft tertahan selamanya meski data server sudah benar. `onSaved()` juga dipanggil tanpa `await` sehingga `onOpenChange(false)` bisa mendahului.

**Fix:** try/catch — bila refetch gagal, draft **sengaja dipertahankan** (header menampilkan nilai yang baru disimpan, bukan data lama yang menyesatkan). `onSaved` di-await.

| Skenario | Perilaku setelah fix |
|---|---|
| Mutation sukses + refetch sukses | draft dibuang, header = data server ✅ |
| Mutation sukses + refetch gagal | draft dipertahankan, tidak menampilkan data lama ✅ |
| Mutation gagal | draft utuh, toast error ✅ |
| Dua tab | tab lain melihat data lama sampai reload — **not_verified** (tidak ada realtime, sesuai keputusan tidak menambah subscription) |
| Refresh setelah save | data server tampil ✅ |

---

## A. Authorization

| Uji | Metode | Hasil |
|---|---|---|
| Anon PATCH `stores` | REST langsung dengan anon key | **401 / 42501** ✅ |
| Anon RPC `consume_download` | REST | ditolak ✅ |
| Anon SELECT `stores` | REST | 200, hanya kolom publik (`id,name`) ✅ |
| `isOwner` admin bukan owner | analisis kode: `store.owner_id === user.id` | **false** ✅ |
| Owner | kode | true ✅ |
| Customer/seller lain | RLS `stores_select_own` (owner_id = auth.uid()) | tidak dapat baris ✅ |

**Backend enforcement:** `updateMyStore` memakai `requireSupabaseAuth` + Zod allowlist + `.eq("owner_id", userId)` + RLS UPDATE `owner_id = auth.uid()`. Privileged fields (owner_id, role, balance, status) tidak ada di validator → ditolak oleh Zod.

**Tidak terverifikasi:** uji runtime dengan token admin/owner sungguhan (butuh kredensial akun yang tidak tersedia di sesi ini). Logika terverifikasi dari kode + RLS.

---

## 🔴 BLOCKER — Temuan lama masih terbuka

**Kolom privat `stores` masih terbaca anon.** Diuji langsung:

```
owner_id           200 TERBACA
contact_email      200 TERBACA
verification_note  200 TERBACA
suspended_reason   200 TERBACA
```

Penyebab: migrasi `20261023100000_stores_public_column_grants.sql` **ada di repo tetapi belum diterapkan ke database**. Ini bukan regresi dari pekerjaan editor; ini perbaikan yang sejak awal menunggu approval Anda.

**Dampak:** `owner_id` toko terekspos publik. Tidak memberi akses tulis (RLS UPDATE tetap ketat), tetapi membocorkan identitas pemilik dan kontak privat seller.

---

## Perubahan file

| File | Perubahan |
|---|---|
| `src/lib/seller.functions.ts` | `isOwner` bandingkan `owner_id === user.id` (bukan keberhasilan SELECT) |
| `src/components/store/store-profile-editor.tsx` | mountedRef, uploadToken, patchDraft, guard Simpan blob, label tunggu, batal batalkan token, try/catch refetch |
| `src/routes/toko.$slug.tsx` | `onSaved` async + try/catch, draft dipertahankan saat refetch gagal |

## Bukti eksekusi

| Uji | Hasil |
|---|---|
| `npx vite build` | **exit 0**, `.output/nitro.json` dihasilkan |
| `tsc --noEmit` (file terkait) | bersih |
| Unit test | **501 lulus / 9 gagal** (9 = pre-existing, terbukti di bagian D) |
| Anon PATCH stores | 401/42501 |
| Anon SELECT kolom privat | 200 (BLOCKER) |

Catatan: `npm run build` mengembalikan exit 127 di shell ini karena artefak npm shim, bukan kegagalan kompilasi — dibuktikan dengan menjalankan `npx vite build` langsung (exit 0) dan artefak `.output/` terbentuk.

## Risiko tersisa

1. **BLOCKER**: migrasi grant kolom `stores` belum diterapkan.
2. File Storage yatim bila Batal setelah upload (tidak ada cleanup job).
3. Multi-tab tanpa realtime — tab lain butuh reload (sesuai keputusan, bukan bug).
4. Uji runtime role admin/owner butuh kredensial.
