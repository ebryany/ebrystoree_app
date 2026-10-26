# Architecture — Ebrystore

## Runtime
- Frontend + server: TanStack Start (React 19, Vite), dijalankan pada edge worker.
- Backend logic: `createServerFn` untuk RPC internal; server route `src/routes/api/public/*` untuk webhook payment gateway.
- Data: Lovable Cloud (PostgreSQL) dengan Row Level Security.
- Auth: Lovable Cloud Auth (email/password + Google).
- Storage: bucket privat untuk file produk, lampiran pelanggan, hasil kerja, dan bukti pembayaran. Akses hanya via signed URL berdurasi pendek.
- Scheduler: cron (pg_cron) memanggil server route publik terproteksi shared-secret untuk expiration, reminder, dan rekonsiliasi.

## Lapisan
```text
UI (routes/components)
  -> server functions (.functions.ts)  <-- validasi + authorization
       -> domain services (.server.ts) <-- business rules, state machine
            -> repository (supabase)   <-- RLS aktif
            -> payment adapter         <-- interface provider-agnostic
            -> storage                 <-- signed URL
            -> notifier                <-- in-app + email
```

## Payment Provider Adapter
Interface konseptual (tidak terikat SDK manapun):
```
createPayment(order, method) -> { providerRef, qrPayload|instructions, expiresAt }
getPayment(providerRef)      -> { status, amount, currency, paidAt }
parseWebhook(rawBody, headers) -> { eventId, providerRef, status, amount, currency }
verifySignature(rawBody, headers) -> boolean
expirePayment / cancelPayment / requestRefund / getRefund / reconcile
```
Domain order hanya mengenal status internal; mapping status provider berada di adapter. Menambah provider = menambah satu adapter, tanpa mengubah order domain.

## Keamanan Berlapis
1. RLS di database (pertahanan terakhir).
2. Authorization eksplisit di server function (object-level).
3. Validasi input Zod di setiap boundary.
4. UI hanya menyembunyikan kontrol, tidak pernah menjadi kontrol akses.

## Observability
Structured log (tanpa PII/secret) per request dengan trace id, audit log domain di database, health check endpoint, dan alert untuk webhook gagal serta order terlambat.