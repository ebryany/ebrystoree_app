# 16 — Audit Testing

Command dijalankan: `bunx vitest run`

```
✓ src/lib/__tests__/authz.test.ts (8 tests) 18ms
Test Files  1 passed (1)
Tests       8 passed (8)
```

| Modul | Test ada | Dijalankan | Lulus | Evidence |
|---|---|---|---|---|
| Authorization helper | YA (8) | YA | YA | output di atas |
| Order engine / RPC | TIDAK | — | — | — |
| Payment / verifikasi | TIDAK | — | — | verifikasi manual 1x (PAY-20260729-000001) |
| RLS / IDOR | TIDAK | — | — | — |
| Digital delivery | TIDAK | — | — | — |
| Service fulfillment | TIDAK | — | — | modul tidak ada |
| Refund | TIDAK | — | — | — |
| Notification | TIDAK | — | — | — |
| Realtime | TIDAK | — | — | tidak ada realtime |
| Storage | TIDAK | — | — | — |
| Component | TIDAK | — | — | — |
| E2E (Playwright) | TIDAK ada suite tersimpan | — | — | hanya smoke manual saat pengembangan |
| Responsive | TIDAK | — | — | — |

Cakupan test terhadap area berbobot: **1 dari 14 area** memiliki test otomatis.
Status QA: **NOT_TESTED** untuk hampir seluruh jalur bisnis.