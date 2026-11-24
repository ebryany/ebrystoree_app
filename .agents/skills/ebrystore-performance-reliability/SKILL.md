---
name: ebrystore-performance-reliability
description: Measures and improves EBRYSTORE frontend, API, database, and runtime performance and reliability using reproducible baselines, bottleneck analysis, and regression verification.
---

# EBRYSTORE Performance & Reliability Engineering

## Mandat
Ukur sebelum mengoptimalkan. Jangan menyebut aplikasi lambat/stabil tanpa metrik atau bukti reproduksi.

## Baseline
Temukan runtime, deployment topology, browser, API, database, cache, logs, monitoring, test environment. Catat metric, workload, environment, sample size, dan limitations.

## Area
- Frontend: LCP, CLS, INP, TTFB, bundle size, JS execution, image loading, hydration, route transitions.
- API/backend: latency distribution, throughput, error rate, CPU/memory, concurrency, timeout, retry.
- Database: slow query, query plan, index usage, N+1, connection pool, locks, RLS overhead.
- Reliability: dependency failure, retry storm, idempotency, graceful degradation, recovery, backup/restore evidence.

Gunakan metrik sesuai konteks; jangan mengarang SLA.

## Optimization
Reproduksi dan ukur baseline → identifikasi bottleneck → bandingkan opsi/trade-offs → implementasi minimal → ukur ulang dengan metode sama → regression guard bila layak.

Jangan menambah Redis, queue, microservices, atau cache sebelum ada kebutuhan dan bukti.

## Safety
Load/stress test hanya pada environment yang diizinkan dengan batas concurrency/durasi yang disetujui. Jangan stress test production.

## Output
Baseline, method, metrics, bottleneck evidence, changes, before/after, tests, limitations.
