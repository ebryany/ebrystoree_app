# Security verification evidence: prompts20/21

Date: 2026-10-01. Repository: `C:\Users\febry\Documents\backup`.

## Scope and evidence provenance

Read-only inspection of the six `src/lib/__tests__/*.test.ts` files, E2E setup/specs under `tests/e2e`, `vitest.config.ts`, and `playwright.config.ts`. The requested evidence target did not exist when inspected; this document is the only file written.

This coverage-review agent inspected no application implementation, SQL migrations, prompt documents, credential artifacts, or `.env` files; performed no network requests, database operations, financial mutations, test execution, or E2E execution. Imported modules were identified from test code, not opened. Other agents own source-flow verification and the main agent executed the local checks recorded below.

**Main-agent execution result during this audit: `npm run test:unit` via Bash passed 58/58 (Vitest 4.1.11, 6 files, 858ms).** This was an executed audit check, not a user-supplied result. Execution details were relayed by the main agent; this coverage-review agent did not independently rerun the command or inspect its runner log. The inspected test declarations account for 58 cases, including parameterized cases. The main agent also ran `npm run lint` (exit 0) and `tsc --noEmit` (exit 2, source/schema type errors). E2E execution status is unknown.

Prompt20/21 requirement text was not inspected under this scope. The acceptance scenarios below address the requested threat categories; they are not a claim of complete prompt-to-requirement traceability.

## Expected versus actual evidence

| Verification item | Expected evidence | Actual evidence | Conclusion |
| --- | --- | --- | --- |
| Unit-suite health | All 58 cases pass | Main agent executed `npm run test:unit` via Bash this audit: 58/58 pass, Vitest 4.1.11, 6 files, 858ms; inspected declarations total 58 | Audit execution passed; not independently rerun by this coverage-review agent |
| Authorization helper | Permission-denial and bypass/audit assertions | Real imported helper invoked against hand-built Supabase mocks | Helper behavior tested; endpoint/RLS enforcement unverified |
| Cross-user and cross-store IDOR | Foreign IDs denied through production request/RPC paths; no disclosure or mutation | No two-principal object-access scenario; migration-text ownership patterns only | Gap |
| Webhook authenticity and amount binding | Invalid authentication and mismatched payment data rejected without state changes | No webhook request, signature, secret, amount-binding, or replay scenario | Gap |
| Financial concurrency and idempotency | Parallel production operations preserve database invariants | Sequential local Set/array simulation and SQL-text uniqueness checks | Gap; model pass is not transaction evidence |
| Refund and stock integrity | Actual lifecycle transitions and inventory/ledger effects verified | Hand-populated refund/reversal ledgers; no stock test | Gap |
| Browser access control | Guest redirects plus identity-specific denial of unauthorized access | Redirect specs exist; admin smoke specs accept either heading or denial | Specs inspected only; no E2E pass claimed |

## Unit evidence inventory

Paths below are relative to the repository root named above. Counts include `it.each` expansion.

| File | Cases | What assertions actually exercise | Security boundary not exercised |
| --- | ---: | --- | --- |
| `src/lib/__tests__/authz.test.ts` | 8 | Imported `slugify`, `loadAccess`, `assertPermission`, `writeAudit`; mocked roles/permissions and header. Denies admin without a specific permission and customer admin-dashboard permission. Allows permission holder and super-admin bypass; checks bypass audit call. Checks audit IP/entity arguments and swallowed thrown audit failure. | Authentication, real role lookup, endpoint integration, object ownership, database/RLS, persisted audit records, spoofed-header handling |
| `src/lib/__tests__/rate-limit.test.ts` | 5 | Imported `enforceRateLimit` with mocked admin RPC. Allows mocked allowed result; denies mocked exhausted result; deliberately returns null on RPC error. Checks refund bucket arguments (5/3600 seconds) and QRIS bucket arguments (10/300 seconds). | Actual counting/window enforcement, parallel bursts, caller identity binding, all endpoint wiring, real database errors. Passing fail-open case does not establish abuse resistance during outages. |
| `src/lib/__tests__/escrow-invariants.test.ts` | 14 | Test-local key builders, `balance`, `hasKey`, Set-backed insert helpers, hand-populated ledgers. Arithmetic, key formatting, sequential duplicate suppression, refund/cancel/expire reversal examples, purchase/refund and balance/cancel examples. | No production escrow code imported; no SQL/RPC executed. No unique-index enforcement, transactions, locking, races, rollback, rejected refund, inventory, or real append-only enforcement. |
| `src/lib/__tests__/regression-fase0.test.ts` | 17 | Reads migration files and searches strings/regexes for actor type, cron calls, rate-limit table/function/revoke, ledger/key/balance definitions, seller/store ownership/RLS, moderation and public storefront markers. | No deployed schema/policy/privilege verification, SQL parsing/execution, scheduler operation, real seller isolation or moderation bypass attempt |
| `src/lib/__tests__/marketplace-report.test.ts` | 11 | Imported report schemas reject incomplete/null overview and invalid money representations (`null`, empty string, invalid string, Infinity); accept numeric PostgreSQL strings. Report search/sort, nonmutation, tie ordering. | Reporting authorization, DB aggregation correctness, payment amount validation, negative/fractional/overflow transaction inputs, financial lifecycle |
| `src/lib/__tests__/academic-copy.test.ts` | 3 | Two source-text scans for prohibited legacy terms and checkout markup; one imported order-label assertion. | Not adversarial financial/authentication tests. Mentioning credentials or academic integrity in source does not enforce security. |
| **Total** | **58** | **25 imported production-helper/schema/label cases; 14 test-local financial-model cases; 19 static-text cases** | **No production financial integration case in this inspected suite** |

### Assertions weaker than their names/comments

- `regression-fase0.test.ts`, A-01: selects the latest textual function definition and asserts absence of `'staff'`; does not assert presence of `'finance'` or execute either refund function.
- A-03 revoke: regex requires an `anon` match, not an independent `authenticated` revoke assertion, despite the case title mentioning both. Concatenated historical migration text cannot prove final privileges.
- Scheduler/store/ledger/moderation checks largely search concatenated migration history. Old, commented, replaced, or subsequently reversed definitions can satisfy text-presence tests without proving current behavior.
- Seller approval case asserts no `INSERT INTO public.user_roles` in the extracted application-function fragment; does not positively exercise approval granting a role. No separate existence assertion for that fragment appears in the case.
- `escrow-invariants.test.ts`, INV-02/03/04: entries are constructed in the test before asserting they exist. These do not show that a completed/cancelled/refunded production operation creates them.
- INV-05 supplies a balanced ledger and checks its balance is nonnegative; never attempts an overdraft.
- Case titled `ON CONFLICT DO NOTHING` uses a local Set, not SQL. Duplicate calls are sequential, not concurrent. Key equality/distinctness does not demonstrate database uniqueness.
- Report money-schema validation concerns report rows, not webhook/checkout/refund amount authorization.

## E2E declarations and configuration

No E2E case was run. These are authored assertions, not observed outcomes.

| File | Authored behavior | Limitation |
| --- | --- | --- |
| `tests/e2e/public/auth-guard.spec.ts` | Five protected-route guest navigations must redirect to `/auth`; auth form visible | Browser redirect only; no direct request/RPC denial, foreign IDs, or state assertions |
| `tests/e2e/authenticated/admin.spec.ts` | Eight admin pages return status below 500, no page errors, and either first heading or denial text; job labels and run button visible unless denied | Unauthorized heading can satisfy the smoke assertion. Does not require a specific role to be denied. Job case may skip and never clicks the run button. No payment/refund mutation tests. |
| `tests/e2e/authenticated/dashboard.spec.ts` | Dashboard/orders/products/settings render with heading, text, or expected URL | One injected identity; no foreign-object access or download authorization |
| `tests/e2e/public/storefront.spec.ts` | Metadata, catalog/search URL, service/legal rendering, selected console-error check | UI smoke/copy coverage, not transaction or security-boundary coverage |
| `tests/e2e/mobile/navigation.spec.ts` | Home/services horizontal overflow checks | Layout only |
| `tests/e2e/auth.setup.ts` | Injects runner-provided session/cookies; writes browser storage state; skips setup without session/key | Not a login/authentication test. Only environment variable names inspected; no values or saved state accessed. |

`vitest.config.ts` includes `src/**/*.{test,spec}.{ts,tsx}`, excludes `tests/e2e/**`, and uses Node. Its label "unit/integration" does not make these tests database integration tests. Its include pattern is wider than the permitted six-file review scope; no conclusions are made about uninspected source tests.

`playwright.config.ts` defines public/mobile/authenticated projects and session setup, `workers: 1`, `fullyParallel: false`, optional CI retry, and a `bun run dev` web server. No explicit adversarial concurrency exists in the inspected specs. Base URL is configurable, so executing this suite cannot be assumed offline or isolated. Retained traces/screenshots/storage state can contain session or user data. Configuration was inspected, never launched.

This coverage-review agent attempted no rerun: the main agent's executed 58/58 audit result suffices for reporting suite health; full-suite execution additionally reads migrations and source files beyond this coverage review's inspection boundary.

## Safe follow-up acceptance scenarios

**Proposed only, not executed.** Before any future integration run, obtain explicit authorization for an isolated disposable local test database and synthetic identities. No production/staging target, live gateway, real funds, external network, or existing credentials. Block outbound network; use a local payment-provider stub and test-only secrets. Integration scenarios necessarily mutate synthetic local records and require separate approval; this task authorized no financial mutations. Any persisted data and browser artifacts must be synthetic/redacted and disposable.

For each scenario, evidence should include tested revision/configuration, real entry point, principal identities, sanitized inputs/results, before/after synthetic database snapshots, and assertions on both denial and absence of side effects. Do not replace production handlers or database constraints with reimplemented test logic.

1. **IDOR and role boundaries.** Create buyers A/B, sellers A/B, anonymous and least-privileged staff identities. Attempt foreign order/payment/refund/credit, store/product/report, and entitlement/download identifiers through applicable production requests and direct allowed RPC/DB paths. Include list/detail/update and forged owner/store fields. Accept only explicit denial or non-disclosing not-found, no foreign data or usable asset URL, no mutations, no role escalation; positive own-object controls must pass. Reject malformed/nonexistent IDs safely. Distinguish ordinary admin denial from authorized audited super-admin bypass.
2. **Webhook authentication.** Send missing/invalid signature or shared secret, altered signed payload, wrong account/provider identity, expired timestamp where supported, malformed body, and duplicate event ID to the real handler using the local stub. Accept rejection for invalid authentication and zero order/payment/ledger/stock/entitlement changes. A valid synthetic callback must succeed once. Replayed authenticated callbacks must not apply effects again. Assert the provider's actual authentication contract, not a generic success-string check.
3. **Webhook amount/reference binding.** For a validly authenticated callback, mismatch order/reference, provider transaction ID, currency and expected payable amount. Exercise underpayment, overpayment, zero, negative, fractional precision and invalid numeric representations according to the payment contract, plus cancelled/expired/already-paid orders. Accept no settlement or fulfillment on invalid binding, no unauthorized credit/stock effects, documented safe handling of late events, and exact-once effects for the matching callback.
4. **Concurrent settlement and balance use.** Synchronize independent connections sending duplicate callbacks or spending the same available credit. Race settlement against cancellation/expiry. Accept a single authorized terminal result, at most one applicable debit/credit/reversal/entitlement, conserved ledger amounts, nonnegative available buyer balance, no partially committed effects. Inspect persisted unique-key/locking/transaction behavior, not a shared in-memory Set.
5. **Refund lifecycle and races.** Reject foreign/unpaid/ineligible-order refunds, unauthorized review/process calls, forged refund amounts, and amounts above remaining paid value. Exercise duplicate processing, concurrent review/process, competing refunds and callback/refund interleaving. Accept refunded total bounded by paid amount, correct seller debit and buyer refund destination/credit exactly once, lawful transitions and balanced accounting. Inject a local failure mid-operation; accept atomic rollback or documented retry-safe recovery, no double payout/credit.
6. **Stock contention and restoration.** With one synthetic unit, race two checkouts/fulfillments. Accept no oversell, stock never negative, at most one allocated unit/entitlement. Duplicate callback must not decrement again. Cancellation, expiry and refund must restore stock exactly once only when required by the product's inventory policy. Failed transactions must not leak reservations. If stock is inapplicable to unlimited digital products, document that boundary and verify finite inventory paths separately.
7. **Real rate-limit enforcement.** Exercise burst/window boundaries through production entry points with isolated principals, including concurrent calls and subject spoofing. Accept correct limits and isolation. Explicitly evaluate the tested fail-open outage behavior against abuse risk; do not call outage resistance verified merely because the helper returns null.
8. **Deployed policies, audit and jobs.** In the disposable database, assert effective role privileges/RLS for each relevant principal and final migration state. Execute only approved synthetic jobs; verify expiry/reversal exactly once and scheduler registration. Verify permitted/denied security events and bypasses are recorded as required; distinguish attempted mock audit calls from durable records and document tolerated audit failures.

## Assessment

The main agent's executed 58/58 pass during this audit supports unit-suite health. Inspected tests provide genuine helper/schema behavior assertions, static regression markers, and financial-rule examples. They do **not** establish IDOR resistance, webhook authenticity/amount correctness, production transaction idempotency, concurrent refund/balance safety, or stock integrity. These are verification gaps, not confirmed implementation vulnerabilities. Source-flow findings belong to the other agents; financial security acceptance remains unverified here.
