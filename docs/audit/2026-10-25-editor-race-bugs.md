# Bukti bug race condition (analisis statis dari source)

## BUG 1 — Simpan tidak diblokir saat upload berjalan

File: `src/components/store/store-profile-editor.tsx:369`
```tsx
disabled={mutation.isPending || draft.name.trim().length < 3}
```

`uploading` TIDAK ada di kondisi disabled. Skenario:
1. Seller pilih gambar → `uploading = "logo"`, pratinjau = `blob:...`
2. Seller langsung klik Simpan → `updateMyStore` terkirim dengan `logoUrl = "blob:http://..."`.
3. Server `isRenderableImageUrl("blob:...")` → DITOLAK atau tersimpan URL tak berguna.

Hasil: mutation gagal ATAU data toko menyimpan URL blob yang tidak bisa diakses siapa pun.
Severity: HIGH (korupsi data).

## BUG 2 — Upload selesai setelah editor ditutup menimpa draft yang sudah dibuang

Alur `pickAsset` (baris ~189-235):
```tsx
const result = await upload({ ... });        // async, bisa lama
...
onDraftChange({ ...draft, [urlField]: result.url });  // <-- tetap jalan!
```

`onDraftChange` dipanggil tanpa cek apakah komponen masih mounted / editor masih terbuka.
Skenario:
1. Seller pilih gambar, upload mulai.
2. Seller tutup editor (draft → null, object URL di-revoke).
3. Upload selesai → `onDraftChange` dipanggil dengan `draft` lama (closure) →
   parent `setDraft(...)` menghidupkan kembali draft!
4. Header storefront kembali menampilkan "Pratinjau" padahal editor sudah ditutup.

Severity: HIGH (state zombie, preview nyangkut).

## BUG 3 — Stale closure: dua upload berurutan saling menimpa

`onDraftChange({ ...draft, [urlField]: result.url })` memakai `draft` dari closure
saat `pickAsset` dipanggil, bukan draft terbaru.

Skenario:
1. Pilih logo → upload A mulai (closure draft = {logo:"", banner:""}).
2. Sambil menunggu, seller ubah nama toko → draft = {logo:"", banner:"", name:"Baru"}.
3. Upload A selesai → `onDraftChange({...closureDraft, logoUrl:A})` →
   nama yang baru diketik HILANG (kembali ke nilai closure lama).

Severity: MEDIUM-HIGH (kehilangan input pengguna).

## BUG 4 — Revoke ganda / kebocoran saat ganti gambar berkali-kali

`setLocalPreview` memanggil `URL.revokeObjectURL(p[kind])` di dalam updater.
React 19 StrictMode memanggil updater dua kali di dev → revoke dipanggil ganda
pada URL yang sama. Revoke ganda tidak berbahaya (no-op), TAPI updater function
punya efek samping — itu anti-pattern dan bisa menghapus URL yang masih dipakai
bila urutan render tidak terduga.

Severity: LOW-MEDIUM (anti-pattern, berpotensi gambar pecah).
