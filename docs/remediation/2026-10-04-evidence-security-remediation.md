# Bukti security remediation pre-launch

Tanggal: 2026-10-04. Role: R04 Database Security, R07 Business Logic, R12 Privilege Escalation, R19 Remediation Planner, R20 Evidence Officer.

## Ringkasan

Dua launch blocker dan satu temuan Medium ditutup, dengan bukti yang dijalankan **sebagai role `authenticated`**, bukan sebagai superuser. Metode ini penting: Management API berjalan sebagai `postgres`, sehingga grant dan RLS tidak teruji bila hanya memakai `set_config('request.jwt.claim.sub')`. Fixture final memakai `SET LOCAL ROLE authenticated`.

## Migration yang diterapkan

| Versi | Isi |
| --- | --- |
| 20261004090000 | Trigger `stores_protect_privileged` + percobaan pencabutan grant kolom |
| 20261004091000 | Perluasan `protect_moderation_fields` untuk `sold_count` (percobaan pertama) |
| 20261004092000 | Guard `SELF_PURCHASE_DENIED` pada `create_digital_order` |
| 20261004093000 | Koreksi BLOCKER-2: cabut grant tabel, berikan kembali kolom profil produk |
| 20261004094000 | Koreksi BLOCKER-1: cabut grant tabel stores, berikan kembali kolom profil toko |
| 20261004095000 | Koreksi lanjutan: kembalikan grant tabel stores karena admin memerlukannya; trigger menjadi penegak |

## Temuan saat remediasi (dan mengapa desainnya berubah)

### 1. REVOKE per kolom tidak efektif

`REVOKE UPDATE (status) ON stores` tidak berpengaruh selama `GRANT UPDATE ON stores` masih ada. PostgreSQL menggabungkan grant tabel dan grant kolom; grant tabel menang. Terverifikasi: setelah `REVOKE` kolom, `has_column_privilege('authenticated','stores','status','UPDATE')` tetap `true`.

### 2. Mencabut grant tabel memblokir admin

Setelah grant tabel dicabut dan hanya kolom profil diberikan, admin tidak dapat mengubah `status` toko. Terverifikasi dari kegagalan fixture: `permission denied for table stores`. Alur resmi admin (`set_seller_suspended`, `review_seller`) ikut mati.

### 3. `available_stock` tidak boleh dikunci di trigger

`recalc_code_stock()` berjalan sebagai pemanggil (seller) ketika stok kode berubah. Trigger yang memblokir semua perubahan `available_stock` akan mematikan fitur stok seller. Karena itu `available_stock` dikunci lewat **grant kolom**, bukan trigger.

### 4. Desain final

| Kolom | Penegak |
| --- | --- |
| `stores.status`, `is_platform`, `reviewed_*`, `suspended_reason`, `owner_id`, `slug` | Trigger `stores_protect_privileged` (kembalikan nilai lama untuk non-admin) |
| `digital_products.sold_count` | Grant kolom (dicabut dari `authenticated`) |
| `digital_products.available_stock` | Grant kolom (dicabut dari `authenticated`) |
| `digital_products.moderation_status` | Grant kolom (dicabut dari `authenticated`) |
| `digital_products.name`, `price`, `status`, dst. | Tetap boleh seller |

Alasan memilih trigger (bukan grant) untuk `stores`: kolom yang sama boleh diubah dua peran berbeda dengan hak berbeda. Grant kolom tidak dapat dibatasi per peran tambahan karena `authenticated` mencakup seller dan admin sekaligus. Trigger dapat memeriksa `is_admin(auth.uid())`.

## Hasil verifikasi (fixture rollback, role `authenticated`)

```
BLOCKER-1
  seller UPDATE stores.status='active'     -> nilai tetap 'suspended'  PASS
  seller UPDATE stores.is_platform=true    -> nilai tetap false        PASS
  seller UPDATE stores.name                -> berhasil                 PASS
  admin set_seller_suspended(store,false)  -> status jadi 'active'     PASS

BLOCKER-2
  seller UPDATE digital_products.sold_count=99999        -> permission denied  PASS
  seller UPDATE digital_products.available_stock=9999    -> permission denied  PASS
  seller UPDATE digital_products.moderation_status       -> permission denied  PASS
  seller UPDATE digital_products.name/price              -> berhasil            PASS

FINDING-4
  seller create_digital_order(produk sendiri)  -> SELF_PURCHASE_DENIED  PASS
  pembeli lain create_digital_order            -> order dibuat          PASS

INTEGRITAS
  Row nyata (orders, payments, seller_ledger) tidak berubah  PASS
```

Bukti: `.zcode/security-fix-live-verify.json`, `.zcode/security-fix-db-apply.json`, `.zcode/security-fix-db-verify.json`, `.zcode/store-restore-apply.json`.

## Test dan build

| Pemeriksaan | Hasil |
| --- | --- |
| Unit test | 30 file, **409 tes lulus** |
| Test baru | 12 tes kontrak security (`security-remediation.test.ts`) |
| Build produksi | exit 0 |
| TypeScript file terkait | 0 error |

## Status gate

```
BLOCK LAUNCH:
  BLOCKER-1  -> TERTUTUP (trigger + verifikasi role authenticated)
  BLOCKER-2  -> TERTUTUP (grant kolom + verifikasi role authenticated)

FIX BEFORE LAUNCH:
  FINDING-4  -> TERTUTUP (guard SELF_PURCHASE_DENIED)
  FINDING-5  -> BELUM (validasi submit_payment_proof belum dikerjakan)
  Refund cabut akses -> BELUM (belum diverifikasi)
  FINDING-3  -> BELUM (rate limit auth belum diverifikasi)

REGRESSION:
  12 test kontrak tersedia dan lulus
  Alur seller (ubah profil toko/produk) terverifikasi tetap bekerja
  Alur admin (set_seller_suspended) terverifikasi tetap bekerja
```

## Pelajaran metode

Fixture pertama saya salah dua kali dan itu terdeteksi, bukan lolos diam-diam:

1. Memakai role `customer` untuk seller, sehingga policy seller tidak berlaku. Diperbaiki menjadi role `seller`.
2. Menguji admin lewat `UPDATE` langsung, padahal RLS `stores_update_own` hanya mengizinkan pemilik. Diperbaiki memakai RPC resmi `set_seller_suspended`.

Keduanya tercatat karena fixture memakai assertion yang gagal keras, bukan pemeriksaan yang selalu lulus.

## Batas yang masih terbuka

- **FINDING-5**: kepemilikan `submit_payment_proof` belum diverifikasi di seluruh cabang.
- **Refund mencabut akses**: belum dipastikan `digital_entitlements.revoked_at` diisi saat refund.
- **FINDING-3**: proteksi brute force auth belum diverifikasi (konfigurasi Supabase).
- **`claim_stock_code`**: tidak memeriksa kepemilikan, tetapi hanya `service_role` dan pemanggil internal; dicatat sebagai defense-in-depth, bukan celah aktif.
- Tidak ada deployment frontend produksi, commit, atau push.
