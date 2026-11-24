---
name: ebrystore-database-engineering
description: Inspects and changes EBRYSTORE database schemas, SQL, migrations, indexes, constraints, transactions, RLS, functions, and storage policies while preserving data integrity.
---

# EBRYSTORE Database Engineering

## Mandat
Jaga schema, query, migrations, permissions, dan data integrity sesuai database aktual. Jangan mengasumsikan Supabase/PostgreSQL sebelum terbukti.

## Discovery
Periksa migrations, schema snapshots, generated types, query layer/ORM, RLS, functions/RPC, triggers, views, indexes, storage rules, test setup.

## Desain data
Tentukan entity, ownership, cardinality, constraints, uniqueness, nullability, lifecycle, retention. Tambahkan index berdasar query pattern dan evidence. Jaga referential integrity, transaction boundary, concurrency, dan satu sumber kebenaran untuk status/saldo/entitlement.

## RLS dan privilege (jika relevan)
- Evaluasi SELECT/INSERT/UPDATE/DELETE policy secara terpisah.
- Uji identity/role berbeda.
- Pastikan ownership dan seller/tenant isolation.
- Audit service-role/admin client, privilege escalation, SECURITY DEFINER, `search_path`, execute grants, views, RPC, storage policies.
- Jangan mengekspos service-role/secret key ke browser.
- Policy permissive hanya dipertahankan bila alasan dan scope jelas.

## Migration safety
Gunakan migration versioned sesuai tool proyek. Pertimbangkan backward compatibility, locks, backfill, rollback, deployment ordering. Jangan mengedit migration yang telah diterapkan tanpa memahami sejarahnya. Jangan menjalankan migration production atau destructive operation tanpa approval dan backup/rollback plan.

## Verifikasi
Uji constraints, ownership, RLS, transaction, duplicate writes, concurrent updates, dan migration compatibility pada local/staging. Catat environment aktual.
