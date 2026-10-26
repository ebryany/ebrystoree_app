# 10 — Audit Digital Delivery

Status: **BROKEN / PARTIALLY_VERIFIED (40%)**

| Aspek | Status | Bukti |
|---|---|---|
| Entitlement dibuat saat payment paid | VERIFIED | dibuat di dalam `verify_manual_payment`; 1 baris nyata |
| Entitlement idempoten | VERIFIED | `ON CONFLICT (order_item_id) DO NOTHING` |
| Tidak ada entitlement sebelum paid | VERIFIED (desain) | satu-satunya penulis adalah RPC verifikasi |
| Library "Produk Saya" | UI ada, isi gagal | `/dashboard/produk-saya` |
| Master file produk | **TIDAK ADA** | `digital_product_files` = 0 baris; tidak ada UI unggah admin |
| Unduhan berhasil | **BELUM PERNAH** | `download_logs` = 0 baris |
| Signed URL | BACKEND_ONLY | `transaction.server.ts:68` `createSignedUrl` |
| Batas 5 unduhan | BACKEND_ONLY | dicek di `consume_download`, belum diuji |
| Masa berlaku 365 hari | BACKEND_ONLY | `valid_until` diisi, belum diuji |
| Revocation saat refund | BACKEND_ONLY | `process_refund` set `revoked_at`, belum diuji |
| Versi file | SCHEMA_ONLY | `file_version` disalin, tanpa manajemen versi |

## Kesimpulan

Rantai `payment paid → entitlement → download` **putus di titik file**. Selama
admin tidak bisa mengunggah master file, produk digital tidak pernah benar-benar
terkirim. `consume_download` akan melempar `FILE_UNAVAILABLE`. Ini gap kritis
(GAP-02).