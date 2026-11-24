# EBRYSTORE — Project Engineering Rules

## Mandat
Bangun, perbaiki, dan pelihara EBRYSTORE dengan pendekatan berbasis bukti, aman, dapat diuji, dan kompatibel. Gunakan Bahasa Indonesia; pertahankan identifier, nama API, simbol kode, dan istilah teknis.

## Integritas konteks
- Jangan mengasumsikan stack, folder, endpoint, tabel, provider, atau status deployment sebelum memeriksa repository.
- `PROJECT_CONTEXT.md` memuat konteks historis dan status verifikasinya. Konteks historis bukan bukti implementasi saat ini.
- Temuan aktual harus memiliki bukti path, simbol, konfigurasi, output tool, atau hasil pengujian.
- Jangan mengklaim telah membaca, menjalankan, atau memverifikasi sesuatu tanpa melakukannya.

## Full Engineering
Untuk pekerjaan besar/lintas domain, pertimbangkan dan koordinasikan: Principal/Lead Engineer, Product & Requirements, System Architect, Frontend, Backend/API, Database, Security, Commerce/Payment, QA/SDET, Performance/Reliability, DevOps/SRE, dan Independent Reviewer.

Full Engineering berarti semua disiplin dipertimbangkan dan role terdampak dilibatkan. Perubahan kecil tetap proporsional; jangan membuat role yang tidak relevan melakukan pekerjaan seremonial.

Alur: Discover → Define → Impact map → Plan → Implement → Verify → Independent review → Report.

## Invariants
- Pertahankan fitur dan perilaku yang bekerja.
- Jangan redesign/rewrite, migrasi besar, atau mengganti stack tanpa kebutuhan dan persetujuan.
- Jangan menambahkan dependency tanpa alasan dan pemeriksaan kompatibilitas.
- Jangan memindahkan business logic sensitif ke frontend.
- Jangan mempercayai role, harga, ownership, payment status, atau permission dari browser.
- Lindungi data customer, seller, transaksi, dan administrasi.
- Periksa isolasi antar-user dan antar-seller pada server/database sesuai desain aktual.
- Jangan mengirim secret ke client, log, screenshot, atau laporan.

## Production safety
Tanpa persetujuan eksplisit, jangan menghapus/mengubah data production, menjalankan migrasi production, deploy, mengubah DNS/firewall/IAM/permission production, merotasi credential, commit/push, atau menjalankan stress test production.

Gunakan local/staging dan data sintetis. Sebelum operasi berisiko, jelaskan dampak, backup, rollback, dan kebutuhan persetujuan.

## Quality gates
- Validasi input pada server boundary.
- Authorization pada server dan database sesuai arsitektur.
- Operasi transaksi menjaga konsistensi dan menangani duplikasi/concurrency.
- Error handling tidak mengembalikan sukses palsu atau membocorkan detail internal.
- Test menguji acceptance criteria dan skenario gagal yang relevan.
- Status VERIFIED hanya dengan bukti.

## Skill routing
- `ebrystore-orchestrator`: koordinasi lintas disiplin.
- `ebrystore-product-requirements`: kebutuhan produk, user journey, business rules, acceptance criteria.
- `ebrystore-codebase-discovery`: memahami repository.
- `ebrystore-system-design`: requirements dan arsitektur.
- `ebrystore-frontend-engineering`: UI, routing, SSR, state, accessibility.
- `ebrystore-backend-api`: server logic, API, authorization.
- `ebrystore-database-engineering`: schema, SQL, RLS, migration.
- `ebrystore-security-engineering`: threat assessment dan remediation.
- `ebrystore-commerce-payment`: cart, checkout, order, payment, webhook, fulfillment.
- `ebrystore-qa-engineering`: testing, regression, release evidence.
- `ebrystore-debugging-refactoring`: root cause dan refactoring.
- `ebrystore-performance-reliability`: metrik dan reliability.
- `ebrystore-devops-release`: build, CI/CD, deployment plan, observability.

Jangan memanggil semua skill untuk setiap tugas. Orchestrator menentukan kombinasi skill sesuai risiko.
