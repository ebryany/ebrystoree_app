# Refund State Machine (Slice 2)

Status refund: `requested`, `under_review`, `information_requested`, `approved`,
`processing`, `completed`, `rejected`, `cancelled`.

| Dari | Aksi | Aktor | Ke | Validasi |
|---|---|---|---|---|
| — | request | customer | requested | order miliknya, status eligible, tak ada refund aktif, dalam refund window, alasan diisi |
| requested | start_review | `refunds.view` | under_review | — |
| under_review | request_information | admin | information_requested | catatan wajib |
| information_requested | respond | customer | under_review | — |
| under_review | approve | `refunds.approve` | approved | jumlah ≤ total dibayar − refund selesai sebelumnya |
| under_review | reject | `refunds.reject` | rejected | alasan wajib |
| approved | process | `refunds.process` | processing | manual: referensi transfer; gateway: adapter `requestRefund()` |
| processing | complete | `refunds.process` | completed | bukti/referensi tersimpan |
| requested/under_review | cancel | customer | cancelled | belum disetujui |

`completed` bersifat final; koreksi hanya lewat entri penyesuaian baru yang teraudit.
Refund selesai atas produk digital mencabut entitlement (`revoked_at`).
Seluruh perubahan status refund berjalan dalam satu transaksi bersama pembaruan
payment, order, histori, task, notifikasi, dan audit log.