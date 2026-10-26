# API / Server Function Specification

Pada stack terpilih, API internal berupa **server function** (RPC bertipe) dan hanya caller eksternal yang memakai **server route** HTTP. Nama di bawah adalah kontrak logis; path HTTP hanya ada untuk endpoint eksternal.

## Konvensi
- Semua input divalidasi Zod; input tak valid → error validasi terstruktur.
- Semua fungsi terproteksi memakai middleware auth dan memeriksa permission secara eksplisit.
- Operasi yang membuat efek keuangan menerima `idempotency_key`.
- Error dikembalikan sebagai `{ code, message }` tanpa detail internal.

## Auth (dikelola platform)
`signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`, `getCurrentUser`.

## Katalog (publik, read-only)
| Fungsi | Input | Output | Permission |
|---|---|---|---|
| listProducts | { q?, category?, page, perPage } | { items, total } | publik (published saja) |
| getProductBySlug | { slug } | product + files metadata | publik |
| listServices | { q?, category?, page } | { items, total } | publik |
| getServiceBySlug | { slug } | service + packages + addons | publik |

## Order
| Fungsi | Input | Aturan |
|---|---|---|
| createOrder | { items[], serviceRequirements?, couponCode?, idempotencyKey } | Total dihitung server (BR-01) |
| listMyOrders | { status?, page } | Hanya milik pemanggil |
| getMyOrder | { orderId } | 404 bila bukan milik pemanggil |
| getOrderTimeline | { orderId } | Gabungan status history + progress updates |
| cancelMyOrder | { orderId, reason } | Hanya sebelum pengerjaan dimulai |

## Payment
| Fungsi/Endpoint | Keterangan |
|---|---|
| createPayment { orderId, method } | Memanggil adapter; mengembalikan QR/instruksi + expiresAt |
| getPaymentStatus { paymentId } | Sumber kebenaran server |
| submitManualProof { paymentId, filePath, senderName, amountClaimed, note } | Status → awaiting_manual_verification |
| verifyManualPayment { proofId, decision, reason? } | Permission `payment.verify` |
| reconcilePayments { dateRange } | Permission `payment.reconcile` |
| `POST /api/public/payments/webhook/{provider}` | Server route; verifikasi signature → idempotent update |
| `POST /api/public/jobs/{task}` | Cron; diproteksi shared secret header |

## Jasa & Operator
`assignOperator`, `listMyTasks`, `getMyTask`, `updateProgress`, `uploadResult`, `requestRevision`, `completeRevision`, `approveResult`.
Semua fungsi operator memvalidasi bahwa assignment aktif milik pemanggil.

## Digital Delivery
| Fungsi | Aturan |
|---|---|
| listMyEntitlements | Milik pemanggil |
| createDownloadUrl { entitlementId } | Cek kepemilikan, kuota, masa berlaku → signed URL 5 menit + tulis download_log |

## Aftersales
`requestRefund`, `approveRefund`, `rejectRefund`, `processRefund`, `createComplaint`, `respondComplaint`, `escalateComplaint`, `resolveComplaint`.

## Laporan
`reportSales`, `reportOrders`, `reportPayments`, `reportOperators`, `reportRefunds` — semua memerlukan `report.view`, mendukung rentang tanggal dan paginasi.