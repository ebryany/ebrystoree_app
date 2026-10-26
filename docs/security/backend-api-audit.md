# Corrected backend/API security audit — Ebrystore

Date: 2026-10-01. Scope: Prompt 04 Backend Zero-Trust / Prompt 05 API Security.

## Verdict and limits

This report supersedes the earlier backend findings. The earlier report incorrectly inferred Critical/High exploits from missing application guards without tracing effective database authorization. Those exploit claims are withdrawn where the migrations establish an enforcing RLS policy or RPC check. A missing application guard is not a demonstrated authorization bypass.

- Complete exported server-function inventory: **154 functions across 18 `src/lib/*.functions.ts` modules**. All modules received handler-level inspection; latest database tracing is targeted, not comprehensive across every function, RPC, trigger, grant, and storage path.
- Migration history inspected through `20261001100001_fix_seller_credit_and_refund.sql` (72 SQL migration files). “Latest” below means latest applicable definition/policy found in repository history. Older policies/grants remain effective unless replaced or revoked; additive permissive policies combine with OR.
- Static repository evidence only. No live Supabase access, runtime exploit, provider transaction, deployed-schema verification, or denied-access integration test. Preconditions involving deployed grants, data, role assignments, known IDs, and provider semantics are not verified.
- No source changes. No `.env` or secret values accessed. This explicitly requested report is the only deliverable file written; its target was checked and absent.
- The earlier blanket assertion that omitted modules were “well-secured” is withdrawn. An inventory entry marked **Unknown** means no complete effective-DB authorization conclusion, not a vulnerability and not an assurance.
- No Critical exploit is established by this review. Separate High findings below have specific static database paths, not simply absent application guards.

All source/migration citations below use **one-based physical file lines**. Relative references resolve under `C:\Users\febry\Documents\backup\`.

## Trust boundaries

`src/integrations/supabase/auth-middleware.ts:74–105` creates a publishable-key client carrying the request Bearer JWT, validates `auth.getClaims(token)`, and derives `context.userId` from the verified `sub`. The client is not a service-role client. Client-supplied user IDs are not the authenticated identity.

`src/integrations/supabase/client.server.ts` defines the server-only, lazy service-role client. Table/storage operations through it bypass caller RLS and therefore require application checks. Reading environment-variable names in code is not reading their secret values.

`src/lib/supabase-public.server.ts` uses the publishable key without a user session for public SSR. Anon policies still apply. `src/integrations/supabase/client.ts:31–55` supplies a browser publishable-key client with authenticated sessions. Consequently direct Supabase API access must also be secured: Zod allowlists in TanStack handlers do not protect direct table writes.

User-JWT RPC transport does **not** mean a `SECURITY DEFINER` RPC body is protected by caller RLS. Its explicit identity, permission, ownership, state checks and EXECUTE grants must be traced. RLS protects rows, not necessarily confidential columns.

Effective shared helpers:

| Helper/control | Latest definition / effective evidence | Meaning |
|---|---|---|
| `is_staff` | `supabase/migrations/20260728115920_fd20fac0-bfa9-4807-bfe8-3815af1b5588.sql:35–46` | operator, support, finance, admin, super_admin |
| `is_admin` | Same migration `:48–59` | admin or super_admin |
| `has_permission` | `supabase/migrations/20260728122903_5cbb0042-81ba-4e4c-b061-9cc0c74196d6.sql:107–117` | DB role-permission join; super_admin bypass |
| `my_store_id` | `supabase/migrations/20260930100010_seller_role_and_stores.sql:111–126` | Store owned by `auth.uid()`; no active-store or seller-role predicate |
| Profile SELECT | Initial migration `:79–82` | Own profile or admin. Support/operator/seller joins do not automatically disclose other customers' email |
| Role changes | RBAC migration `:205–234` | Self-assignment prevention, last-super-admin protection, `roles.manage` policies. No arbitrary customer self-escalation demonstrated |

## Corrected adjudication of challenged findings

“Refuted” means the earlier ordinary-customer/cross-owner exploit path is blocked by the repository's effective controls. It is not a claim that every possible path is safe.

| Function/path | Corrected severity and status | Effective authorization / latest applicable migration evidence | Remediation |
|---|---|---|---|
| `submitPoQuote` → `po_submit_quote` | Earlier Critical withdrawn; exploit refuted. Informational application defense-in-depth gap | PO migration `20260820012138_9b9e588b-686b-4a7f-a580-d298f283f3b8.sql:139–176`; `is_staff(auth.uid())` at `:147`, quote state at `:150`, positive total/DP range at `:151–153`, authenticated EXECUTE at `:176` | Optional app role check aligned with actual DB policy. Do not invent an existing `po.manage` permission |
| `verifyPoPayment` → `po_verify_payment` | Earlier Critical withdrawn; ordinary-customer exploit refuted. Separate state finding F6 | Same migration `:247–298`; staff check `:255`, decision `:256`, row locks `:257–259`, EXECUTE `:298` | Align app guard with DB; harden transition checks separately |
| `deliverPoResult` → `po_deliver` | Earlier Critical withdrawn; exploit refuted. Informational guard gap | Same migration `:301–341`; staff `:309`, work state `:312`, remaining amount from stored quote/DP `:314`, EXECUTE `:341` | Optional equivalent app guard |
| `listAllPoRequests` | Earlier cross-customer disclosure claim refuted; no High finding | Same migration `:44–54`: SELECT grant, RLS, owner OR staff at `:49–50` | If endpoint contract is staff-only, add app staff check; RLS already filters customers to own rows |
| `getPoRequest` | Earlier cross-customer BOLA refuted | Parent policy `:49–50`; message policy `:74–77`; payment SELECT grant `:109`, policy `:113–114`. Hidden parent returns no details | Optional explicit owner/staff predicate for clarity; retain child RLS |
| `sendPoMessage.sender_role` | Earlier random-user staff impersonation refuted | Same migration `:78–86` binds `sender_id`, requires `is_system=false`, staff role for staff messages, request owner for customer messages | Preserve DB field/role enforcement; notification elevation occurs only after successful insert |
| `getPoProofUrl` | Arbitrary service-role signing claim refuted | Reads `po_payments` under user JWT, signs with same user storage client. Payment-proofs policies `20260728131741_24cbeefc-f5ab-48d6-843f-4115f28ff158.sql:2–9` restrict own folder or `payments.view` staff | No demonstrated cross-customer signing bypass; validate stored proof object/path independently |
| `listAllInquiries` | Earlier broad customer disclosure refuted | Base inquiry migration `20260905003813_094c655b-0697-45d6-a00f-4adb93111092.sql:26–40` grants SELECT with owner/staff policy. Latest additive seller policy `20260930100027_buyer_seller_chat.sql:29–32` allows own-store inquiries | Optional staff-only app contract; avoid treating RLS-filtered SELECT as unrestricted |
| `getInquiry` | Earlier cross-customer BOLA refuted | Same cumulative parent policies; base message SELECT `:42–46`, latest seller message SELECT `:42–51`. Parent lookup gates handler joins | Field projection still needs separate review; profile joins remain independently RLS-scoped |
| `setInquiryStatus` | Arbitrary-other-thread update claim refuted; intended rights require policy decision | Base owner/staff UPDATE `:38–40`; latest seller UPDATE `:35–39` | Owners/sellers are explicitly allowed status updates. Decide desired closing/reopening rights; count affected rows instead of returning success for hidden IDs |
| `sendInquiryMessage` fallback to staff | Handler unrelated-user escalation refuted. Separate direct API message-integrity F3 | Parent RLS permits only owner/staff/associated seller; handler derives customer/seller/staff from accessible parent | Do not equate fallback label with unrestricted parent access; enforce direct API role fields separately |
| `saveMyProduct` | Earlier High cross-seller BOLA withdrawn; refuted. Separate own-row moderation F2 | Latest seller UPDATE `20260930100013_catalog_ownership_moderation.sql:71–74`: old row must belong to `my_store_id()` and caller needs `seller.products.manage`; new row must still belong to caller store. Admin policy remains intentionally broad | Optional `.eq('store_id', storeId)`; verify affected row count; validate discount lower than base price |
| `assignOperator` → `assign_operator` | Earlier High customer escalation withdrawn; refuted | Latest definition `20260728190807_282b1924-7e46-44a8-bdc8-9e70a5473c8d.sql:566–590`: auth `:571`, `orders.assign` `:572`, order state `:575–576`, academic approval `:578–581`, operator role `:583–586`, duplicate protection `:587–590`. Original revoke/grant `20260728171844_bfa12cdf-0586-40b7-9f17-a4ea676479b9.sql:348,352` preserved across replacement | Optional matching application permission guard |
| `operatorAction` / `submitJobResult` / `reviewJobResult` | Generic absent-guard exploit allegations withdrawn | Latest RPC definitions in `20260728171844_bfa12cdf-0586-40b7-9f17-a4ea676479b9.sql:164–176,228–243,279–290`: operator permission/assignment or customer order ownership plus state checks | Defense-in-depth only for missing equivalent handler check |
| `getOrderFulfillment` | Arbitrary customer BOLA refuted; separate internal-field F4 | Latest owner/operator policies `20260728175408_f0cfe3ed-4e67-4349-8ba2-0af47d2ecff2.sql:17–22,44–54`; staff policies retained | Role-based field projections, not an invented lack of row authorization |
| `getMyOrder`, QRIS payment lookup | Earlier cross-customer allegations refuted | Orders owner/staff policies `20260728131303_a6b697c9-8537-4484-b7cc-dc81be8b40d5.sql:83–84`; payments owner/`payments.view` `:230–232` | Decide whether customer-named endpoints must exclude legitimate staff visibility before elevated writes |
| Notification marking | Earlier other-user mutation allegations refuted | `20260728131438_a2549a54-44e5-4e9d-a3ec-816d51f0a6e1.sql:170–172` scopes SELECT/UPDATE to recipient | Optional explicit recipient predicate; RLS is an existing control |

PO staff rights use the broad `is_staff` helper, not granular payment/order permissions. Operator/support/finance access and the effect of granular permission revocation are a **policy/design question**, not a proven ordinary-customer exploit. Any future narrower permissions must be introduced consistently in migrations and handlers.

## Evidence-supported separate findings

### F1 — High: nullable authorization predicate in `update_admin_task`

**Status:** statically supported direct-RPC authorization bypass; deployment/runtime unverified. Requires an authenticated user, a known existing unassigned task ID, and the repository's effective authenticated EXECUTE grant. RLS may prevent the user discovering task IDs; this report does not establish ID discovery. The handler's `tasks.view` gate also means an ordinary customer uses the direct RPC surface, not necessarily the TanStack handler.

Evidence:

- `C:\Users\febry\Documents\backup\supabase\migrations\20260728180436_c912b0a3-24e6-4dd2-9c4a-94080fc7f628.sql:23–40` is the latest `SECURITY DEFINER` definition. It checks identity, but non-assign actions use:

```sql
ELSIF NOT (public.has_permission(auth.uid(), 'tasks.update') OR t.assignee_id = auth.uid()) THEN
  RAISE EXCEPTION 'FORBIDDEN';
```

- `:54–68` claims/completes/cancels/reopens and updates the task. `:78–79` revokes PUBLIC/anon and grants EXECUTE to **authenticated**.
- `20260728131438_a2549a54-44e5-4e9d-a3ec-816d51f0a6e1.sql:132` declares nullable `assignee_id`.
- For no permission + NULL assignee: `false OR NULL` is NULL; `NOT NULL` is NULL; PL/pgSQL `IF` does not raise for NULL. The same authenticated user can claim that task and subsequently match its assignee. The assign branch remains permission-checked; completing assignment tasks additionally requires an existing operator assignment at `:43–50`.
- Audit writing does not restore authorization: `20260728122903_5cbb0042-81ba-4e4c-b061-9cc0c74196d6.sql:237–261` checks authentication, not task permission.

Impact: unauthorized operational-task integrity changes; no arbitrary financial settlement or global role escalation claimed.

Fix the **DB predicate**, not merely the handler:

```sql
ELSIF (public.has_permission(auth.uid(), 'tasks.update')
       OR t.assignee_id = auth.uid()) IS NOT TRUE THEN
  RAISE EXCEPTION 'FORBIDDEN';
END IF;
```

Also reject NULL actions, align application action-specific permissions, test known/unassigned/assigned tasks for customers and each staff role. The earlier generic claim that `tasks.view` alone authorizes all mutations was inaccurate; this specific NULL bug is the supported issue.

### F2 — High: own-product direct writes can bypass moderation

**Status:** statically supported column-level authorization flaw; runtime/deployment unverified. Requires an authenticated store owner with `seller.products.manage`. This is **not** the refuted cross-seller `saveMyProduct` exploit.

Evidence:

- `C:\Users\febry\Documents\backup\supabase\migrations\20260728115920_fd20fac0-bfa9-4807-bfe8-3815af1b5588.sql:202` grants table-wide authenticated INSERT/UPDATE/DELETE on `digital_products`.
- `C:\Users\febry\Documents\backup\supabase\migrations\20260930100013_catalog_ownership_moderation.sql:62–74` authorizes own-store INSERT/UPDATE; it does not restrict moderation/reviewer fields.
- Latest moderation trigger `:78–96` only downgrades publication when `NEW.moderation_status <> 'approved'`. An own-row direct update setting `moderation_status='approved'` and `status='published'` satisfies the row policy and avoids that downgrade. New products also default moderation status to approved at `:35` unless overwritten.
- No later column revoke or protective moderation-field trigger was located in migration tracing. The handler payload `src/lib/seller.functions.ts:151–162` excludes these columns; direct Supabase calls bypass that allowlist.

Impact: seller self-approval/publication of their own unreviewed products; undermines the documented moderation boundary. No other seller's ownership bypass claimed.

Fix: enforce protected moderation/reviewer/status fields at the DB boundary. Use a trusted moderation RPC and reject unauthorized approval changes; revoke unrestricted table writes in favor of column grants or tightly scoped seller RPCs. Reset approval after review-relevant content changes. Keep admin/moderation permission pathways explicit. Test direct REST INSERT/UPDATE, not just the handler.

### F3 — Medium: inquiry message role/system labels are caller-writable

**Status:** statically supported direct-table integrity flaw; runtime unverified; limited to accessible own/own-store threads.

Evidence:

- Base message INSERT `20260905003813_094c655b-0697-45d6-a00f-4adb93111092.sql:47–52` binds real `sender_id` and owner/staff thread access, **not** `sender_role` or `is_system`.
- Latest seller INSERT `20260930100027_buyer_seller_chat.sql:54–64` has the same omission. Its `:22–26` role constraint allows customer, staff, seller, system.
- Latest touch trigger `:67–79` uses caller-writable `sender_role` to set answered/open status.

An authenticated customer can insert on their own inquiry with a false staff/seller/system label or `is_system=true`; a seller can do so on their own-store thread. Sender identity is still the real user. No arbitrary other-thread access, role grant, or PO equivalent is established. The PO message policy explicitly prevents this class of spoofing.

Fix: enforce role derivation, permitted role/thread relation, and non-system messages in DB policies/triggers. Reserve system messages to controlled RPC/service paths. Replace **both** permissive INSERT policies; adding one strict policy beside an old permissive policy does not fix their OR combination.

### F4 — Medium, conditional: customer-facing fulfillment returns internal fields

**Status:** static response path confirmed; confidentiality impact depends on intended field meaning and populated contents. Runtime data not examined.

`src/lib/fulfillment.functions.ts:173,195,212,217` selects/returns `operator_assignments.internal_note` and `service_order_details.internal_deadline`. Latest owner SELECT policies `20260728175408_f0cfe3ed-4e67-4349-8ba2-0af47d2ecff2.sql:20–22,44–46` allow the customer to read those rows. Row-level authorization is working; field minimization is missing if these fields are intended to be staff-only. This is not cross-order BOLA.

Fix: role-specific response projections. If direct Supabase clients must never see these columns, protect DB column access or split public/private tables; fixing only the handler is insufficient.

### F5 — Medium, confirmation required: QRIS polling supplies expected, not provider-paid, amount

**Status:** static financial reconciliation defect; underpayment exploit not reproduced. Provider amount semantics and ability to return paid status with a mismatched amount require verification.

`src/lib/payments.functions.ts:109–126` checks provider status then passes `Number(payment.expected_amount)` to `settleSumopodPayment`, discarding `detail.amount`. `src/lib/sumopod.server.ts:73–88` actually returns provider amount. `:180–188` forwards the supplied amount through service role.

Latest settlement migration `20260816165151_cba59ca4-cb03-45e4-8671-5f0afd1eab7c.sql:27` rejects a paid amount below expected, but this call supplies expected amount itself. `:104–105` restricts execution to service role, blocking direct customer settlement. The finding is amount provenance, not missing owner RLS.

Fix: validate provider transaction ID, merchant/currency and actual received amount according to documented gross/net/fee semantics; reject missing/nonfinite/mismatched amounts, pass verified paid amount, retain idempotency. Test mismatch and stale payment-link cases without real funds.

### F6 — Medium: staff PO verification lacks guarded payment/order transitions

**Status:** static workflow weakness, staff-only; runtime unverified. Not an ordinary-customer authorization exploit.

`20260820012138_9b9e588b-686b-4a7f-a580-d298f283f3b8.sql:255–288` authenticates staff and locks rows, but permits approve/reject without requiring payment status submitted or checking corresponding request stage. Existing verified payments can be rejected; approving an old DP payment can set its request back to in_progress. No duplicate credit/financial loss was established.

Fix: explicit payment/request transition matrix, proof preconditions, terminal-state protection and idempotent repeated decisions. Retain locks; decide the intended breadth of staff roles separately.

## Other limitations / follow-ups, not established High exploits

- `setInquiryStatus` is restricted to its status payload. Direct authenticated table UPDATE on inquiries is broader: base grant `20260905003813_094c655b-0697-45d6-a00f-4adb93111092.sql:26–40` plus latest seller row policies. Field-level protection for participant/store/product reassignment needs further adjudication. Latest `fill_inquiry_store_id` only fills missing store ID (`20260930100027_buyer_seller_chat.sql:84–100`); it does not correct a supplied mismatch. Do not interpret handler mass-assignment safety as direct-table safety.
- Seller file service-role `verifyOwnership` (`src/lib/seller-files.functions.ts:40–50`) checks `stores.owner_id` against verified user ID. Other-seller file access is not demonstrated. It does not require active store, non-deleted product, or `seller.products.manage`; intended suspension/permission enforcement needs explicit review before severity assignment.
- Seller/admin file registration accepts client MIME/size metadata; storage existence search is not an exact filename comparison. Validate actual object metadata and object identity. A bypass of ownership was not shown.
- File moderation reset migration `20260930100024_seller_file_upload.sql:39–77` attaches INSERT/DELETE triggers, not `is_active` UPDATE. Full delivery/moderation implications of active-file toggles are not adjudicated.
- `saveMyProduct` lacks the admin handler's discount-lower-than-price rule. Seller catalog pricing is legitimate author input, not an untrusted customer checkout total. RLS-filtered updates can affect zero rows while reporting success.
- Generic `createServiceOrder` exists, but authenticated EXECUTE was revoked in `20260728190807_282b1924-7e46-44a8-bdc8-9e70a5473c8d.sql:398`. Treat this as a potential disabled/dead route, not successful unauthorized creation.
- `is_order_operator` (`20260728175408_f0cfe3ed-4e67-4349-8ba2-0af47d2ecff2.sql:1–4`) matches assignments without an active-status filter. Intended former-operator read retention needs a policy decision.
- Webhook HMAC verification in `src/lib/sumopod.server.ts:152–176` has no visible timestamp-freshness check. Route call graph/replay impact was not completed; no replay exploit asserted.

## Zero-trust business invariants: what was actually traced

| Invariant | Evidence / corrected conclusion | Remaining scope |
|---|---|---|
| Identity | Verified JWT claims; DB `auth.uid()` | Deployment token/JWKS configuration not inspected |
| Roles/permissions | DB helpers and admin handler guards; explicit assign/operator/task guards | Full role-permission matrix write paths not audited; F1 nullable guard |
| Ownership | PO/inquiry cumulative policies; product old/new row policy; order/payment/notification RLS | Remaining RPC/table/storage paths are not all traced |
| Digital prices/totals | Latest `create_digital_order`, `20260930100028_checkout_seller_enforcement.sql:4–84`, reads persisted catalog price without a reservation/row lock, uses persisted catalog price/discount, checks store/stock and computes amount | Full checkout, service/academic discounts/coupons, rounding and concurrent inventory accounting not exhaustively reviewed |
| PO quote/DP/final totals | Staff quote validation, DB DP calculation, owner response creates persisted payment, final uses stored total minus DP | F6 verification transitions; direct INSERT field allowlists need further review |
| Balance/credit/refunds | Handler calls DB RPCs, not trust in client balance asserted | Latest `20261001100001_fix_seller_credit_and_refund.sql` business invariants not fully adjudicated; no assurance on all ledger paths |
| Payment/order state | DB PO quote/delivery checks and gateway locks/idempotency/amount floor | F5 source amount; F6 states; all refund/service transitions not traced |
| Entitlement/download | Own/staff entitlement/download-log policies in `20260728131438_a2549a54-44e5-4e9d-a3ec-816d51f0a6e1.sql:36–38,56–58` | Latest consume/download concurrency, asset secrecy and code delivery not fully traced |
| Mass assignment | Selected handlers build explicit payloads; no raw arbitrary data spread conclusion | Direct table grants can bypass handler allowlists; F2/F3 |
| Excessive data | Profile RLS refutes blanket email-disclosure allegation; F4 is field-level | All response DTOs not exhaustively reviewed |

## Elevated client operations

| Path | Client / observed boundary | Coverage / risk conclusion |
|---|---|---|
| PO/inquiry staff and message RPC/table calls | User JWT | DB role/row checks traced above; service role is not their initial authorization boundary |
| `startQrisPayment` metadata update | Service role after JWT-scoped payment lookup | Other-customer lookup blocked; legitimate `payments.view` staff visibility may be broader than intended customer mutation contract |
| `checkQrisPayment` settlement | Service-role `settle_gateway_payment` after scoped lookup/provider status | Effective grant service_role-only `20260816165151_cba59ca4-cb03-45e4-8671-5f0afd1eab7c.sql:104–105`; F5 |
| Admin product-file handlers | Service role behind `products.view/update/delete` application permissions | App gate observed; elevated object-validation details not fully traced |
| Seller product-file handlers | Service role plus explicit owner comparison | No cross-owner bypass demonstrated; suspension/permission checks remain open |
| PO/inquiry message notifications | Service-role table insert after successful authorized message write | No pre-insert notification bypass demonstrated |
| `runJobNow` | `settings.manage` app guard; service-role `job_expire_orders`, `job_flag_overdue_tasks`, `job_check_sla_breach` | Latest job bodies not fully audited. Jobs are not ordinary user-JWT RPC calls |
| `enforceRateLimit` | Service-role `check_rate_limit`; authenticated user ID supplied server-side | Grant boundary `20260930100009_rate_limit.sql:74–75` service_role-only; endpoint coverage and fail-open behavior not exhaustively adjudicated |
| Public catalog-image route | Service-role bucket download | Public by design; publication linkage/asset confidentiality open |
| Website settings helper | Server-only settings helper | Complete helper/data-field authorization tracing not done; public use does not establish private-setting leakage |

## Route authentication review

77 TSX route files were enumerated and scanned for server handlers/direct Supabase calls; not every route received full content-level review. No additional `createServerFn` declarations outside `src/lib` were located.

- `src/routes/_authenticated/route.tsx:7–11` explicitly skips its `beforeLoad` session check on the server. Its client component redirects unauthenticated sessions. This is a UI boundary, not server authentication. Authenticated server functions have their own middleware; the SSR skip does not by itself prove a data leak. Add server route gating for clearer route contract if private SSR content is required.
- `src/routes/_authenticated/admin/route.tsx:41–43` exposes a component route with permission-filtered navigation; no server beforeLoad authorization was identified. Navigation visibility does not authorize APIs.
- `src/routes/api/public/catalog-image.$.tsx` is an intentionally public GET handler. It checks path format/traversal and downloads catalog-image storage objects with service role, but no linked-product publication check was identified. Determine whether all bucket keys are intentionally public before assigning exposure severity.
- Auth/session operations and signed uploads elsewhere were observed, not a blanket unauthenticated-backend finding.

## Remediation and verification order

1. Fix F1's NULL-safe DB authorization and NULL action validation. Test direct authenticated RPC calls with known IDs; separate tasks.view, tasks.update and tasks.assign.
2. Protect moderation columns and publication invariants at DB level (F2). Test direct INSERT/UPDATE, own/other store, seller with revoked permission, admin and controlled review RPC.
3. Replace inquiry message INSERT policies with role/system integrity checks (F3); test both owner and seller permissive paths.
4. Decide internal-field confidentiality, introduce customer/staff projections and DB protection if needed (F4).
5. Verify provider-paid amount semantics; harden settlement source validation (F5). Add PO verification transition/idempotency tests (F6).
6. Compare deployed schema, grants, policies and function bodies against these migrations in an authorized environment. Run a role/ownership matrix including anonymous, customer A/B, seller A/B, suspended seller, operator, support, finance, admin, super_admin.
7. Finish effective DB tracing for Unknown inventory entries. Add equivalent app checks only as defense-in-depth; do not replace DB controls or restore unsupported Critical claims.

## Inventory coverage — complete enumeration, targeted adjudication

All 154 exported functions were enumerated with declaration lines and handler metadata. Individual 154-function authorization rows are **not included in this finalized report**; the challenged functions receive detailed rows above. No omitted module is certified secure. Remaining effective-DB checks are Unknown / not fully traced. Full enumeration evidence is available in the local tool output `C:\Users\febry\.zcode\cli\exec\sess_subagent_agent_35b2c24b-fa41-456a-8787-65673998005f\call_YUtx5AkJXzp7AIcdoRFs0mxc-stdout.log`; this is not a substitute for further DB authorization review.

| Module under `src/lib/` | Exported functions | Coverage |
|---|---:|---|
| academic.functions.ts | 5 | Handler inspection; complete DB tracing not done |
| admin-seller.functions.ts | 9 | Handler permission checks; complete DB tracing not done |
| admin-transaction.functions.ts | 15 | Handler checks; targeted task RPC tracing, F1 |
| admin.functions.ts | 23 | Handler checks; targeted shared RBAC controls |
| articles.functions.ts | 6 | Handler/public projections; complete DB tracing not done |
| catalog.functions.ts | 5 | Public handler review; complete DB tracing not done |
| fulfillment.functions.ts | 9 | Targeted assignment/operator/owner RPC and policy checks, F4 |
| inquiries.functions.ts | 7 | Targeted cumulative row/message policies, F3 |
| jobs.functions.ts | 2 | Handler permission/elevation review; job bodies not fully traced |
| notifications-admin.functions.ts | 3 | Handler permission review; complete DB tracing not done |
| orders.functions.ts | 19 | Targeted owner RLS, checkout and notifications; remaining paths Unknown |
| payments.functions.ts | 2 | Payment RLS, elevated settlement grant and amount provenance, F5 |
| po.functions.ts | 12 | Targeted staff/owner/message/storage controls, F6 |
| product-files.functions.ts | 7 | Handler permissions/elevation; full storage/DB tracing not done |
| reviews.functions.ts | 4 | Handler/public projections; complete DB tracing not done |
| seller-files.functions.ts | 8 | Explicit elevated ownership checks; policy follow-ups open |
| seller.functions.ts | 14 | Targeted product ownership/moderation and store helper, F2 |
| website-settings.functions.ts | 4 | Handler permissions; complete helper/DB tracing not done |
| **Total** | **154** | **18 modules; no blanket security assurance** |

This is a corrected targeted audit, not a complete 154-function effective-authorization certification.
