# Role & Permission Matrix

Role: `customer`, `operator`, `support`, `finance`, `admin`, `super_admin`.

| Permission | customer | operator | support | finance | admin | super_admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| catalog.view (published) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| product.create/update/delete | | | | | ✔ | ✔ |
| service.manage | | | | | ✔ | ✔ |
| order.create | ✔ | | | | | |
| order.view_own | ✔ | | | | | |
| order.view_assigned | | ✔ | | | | |
| order.view_any | | | ✔ | ✔ (payment scope) | ✔ | ✔ |
| order.assign | | | | | ✔ | ✔ |
| order.update_progress | | ✔ (assigned) | | | ✔ | ✔ |
| order.cancel_own | ✔ | | | | | |
| payment.verify / payment.reject | | | | ✔ | ✔ | ✔ |
| payment.reconcile | | | | ✔ | ✔ | ✔ |
| refund.request | ✔ (own) | | | | | |
| refund.approve / reject | | | | | ✔ | ✔ |
| refund.process | | | | ✔ | ✔ | ✔ |
| complaint.create | ✔ | | | | | |
| complaint.respond / escalate / resolve | | | ✔ | | ✔ | ✔ |
| download.own_entitlement | ✔ | | | | | |
| user.manage | | | | | ✔ | ✔ |
| role.manage | | | | | | ✔ |
| report.view | | | | ✔ (keuangan) | ✔ | ✔ |
| audit_log.view | | | | | ✔ | ✔ |
| settings.manage | | | | | | ✔ |

## Aturan Penegakan
- Semua pemeriksaan dilakukan di server function/route; UI hanya menyembunyikan kontrol.
- Object-level: `order.view_own` menguji `order.user_id = auth.uid()`; `order.view_assigned` menguji assignment aktif milik operator.
- Finance tidak memperoleh `role.manage`, `settings.manage`, atau `order.update_progress`.
- Perubahan role hanya oleh `super_admin` dan selalu tercatat di audit log.