import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_SERVICE_CHECKOUT_ENABLED,
  marketplaceServiceActionSchema,
  marketplaceServiceDraftSchema,
} from "../marketplace-service";

const sql = readFileSync(
  "supabase/migrations/20261003110000_marketplace_service_contract.sql",
  "utf8",
);
const server = readFileSync("src/lib/marketplace-service.functions.ts", "utf8");
const draft = {
  name: "Jasa desain",
  categoryId: "00000000-0000-4000-8000-000000000001",
  price: 50000,
  agreement: {
    scope: "Desain satu halaman",
    exclusions: "Tanpa cetak",
    deliverable: "File desain",
    requirements: "Brief dan logo",
    durationDays: 3,
    revisionLimit: 1,
  },
};

describe("marketplace service draft boundaries", () => {
  it("accepts one fixed-price agreement and trims text", () => {
    const result = marketplaceServiceDraftSchema.parse({ ...draft, name: " Jasa desain " });
    expect(result.name).toBe("Jasa desain");
    expect(result.agreement).toEqual(draft.agreement);
  });
  it("rejects free, fractional, negative and unsafe prices", () => {
    for (const price of [0, -1, 1.5, 1_000_000_001, Number.NaN]) {
      expect(marketplaceServiceDraftSchema.safeParse({ ...draft, price }).success).toBe(false);
    }
  });
  it("rejects extra ownership, status, fee and acceptance fields", () => {
    for (const key of ["storeId", "status", "adminFee", "acceptedAt"]) {
      expect(marketplaceServiceDraftSchema.safeParse({ ...draft, [key]: "injected" }).success).toBe(
        false,
      );
    }
  });
  it("requires all agreement fields and integer duration/revision", () => {
    for (const field of Object.keys(draft.agreement)) {
      const agreement = { ...draft.agreement } as Record<string, unknown>;
      delete agreement[field];
      expect(marketplaceServiceDraftSchema.safeParse({ ...draft, agreement }).success).toBe(false);
    }
    for (const invalid of [
      { durationDays: 0 },
      { revisionLimit: -1 },
      { durationDays: 1.5 },
      { revisionLimit: 0.5 },
    ]) {
      expect(
        marketplaceServiceDraftSchema.safeParse({
          ...draft,
          agreement: { ...draft.agreement, ...invalid },
        }).success,
      ).toBe(false);
    }
  });
  it("binds updates to an expected version", () => {
    expect(
      marketplaceServiceDraftSchema.safeParse({ ...draft, id: draft.categoryId }).success,
    ).toBe(false);
    expect(marketplaceServiceDraftSchema.safeParse({ ...draft, expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(
      marketplaceServiceDraftSchema.safeParse({
        ...draft,
        id: draft.categoryId,
        expectedVersion: 1,
      }).success,
    ).toBe(true);
  });
  it("requires a reason and exact version for moderation", () => {
    const action = {
      id: draft.categoryId,
      expectedVersion: 1,
      action: "approve",
      reason: "Sesuai scope",
    };
    expect(marketplaceServiceActionSchema.safeParse(action).success).toBe(true);
    expect(marketplaceServiceActionSchema.safeParse({ ...action, reason: "   " }).success).toBe(
      false,
    );
    expect(
      marketplaceServiceActionSchema.safeParse({ ...action, expectedVersion: 0 }).success,
    ).toBe(false);
  });
});

describe("marketplace service SQL/source contracts (not database execution)", () => {
  it("preserves the historical hard stop and activates only the guarded new RPC", () => {
    expect(MARKETPLACE_SERVICE_CHECKOUT_ENABLED).toBe(true);
    const checkout = sql.slice(
      sql.indexOf("CREATE FUNCTION public.create_marketplace_service_order"),
      sql.indexOf("REVOKE ALL ON FUNCTION"),
    );
    expect(checkout).toContain("RAISE EXCEPTION 'MARKETPLACE_SERVICE_DISABLED'");
    expect(checkout).not.toMatch(/INSERT|UPDATE|DELETE/);
    expect(server.slice(server.indexOf("export const createMarketplaceServiceOrder"))).toContain(
      "_agreement_accepted: data.agreementAccepted",
    );
  });
  it("does not enable public catalog, direct writes or order/ledger mutation", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL ON public.marketplace_services FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain("GRANT SELECT ON public.marketplace_services TO authenticated");
    expect(sql).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE|ALL) ON public.marketplace_services TO authenticated/,
    );
    expect(sql).not.toMatch(
      /TO anon USING|ALTER TABLE public.orders|INSERT INTO public.(orders|payments|seller_ledger)/,
    );
  });
  it("checks own active store independently of moderator role", () => {
    expect(sql).toContain("WHERE owner_id = v_user FOR SHARE");
    expect(sql).toContain("AND store_id = v_store.id FOR UPDATE");
    expect(sql).toContain("NOT v_moderation AND v_store.owner_id <> v_user");
    expect(server).toContain('.eq("store_id", store.id)');
  });
  it("checks SQL permission, blocks self moderation and rejects stale state", () => {
    expect(sql).toContain("public.has_permission(v_user, 'services.update') IS NOT TRUE");
    expect(sql).toContain("SELF_MODERATION_DENIED");
    expect(sql).toContain("v_before.version <> _expected_version");
    expect(sql).toContain("v_before.status <> 'in_review'");
    expect(sql).toContain("version = version + 1");
    expect(sql).toContain("status = 'draft'");
  });
  it("validates agreement/category again in SQL and writes audit atomically", () => {
    expect(sql).toContain("_agreement ?& ARRAY");
    expect(sql).toContain("jsonb_typeof(jsonb_extract_path(_agreement, v_key)) <> 'string'");
    expect(sql).toContain("kind = 'service'");
    const catalog = sql.slice(0, sql.indexOf("-- ================= KONTRAK ORDER JASA"));
    expect(catalog.match(/INSERT INTO public.audit_logs/g)).toHaveLength(2);
    expect(sql).not.toContain("WHEN OTHERS");
  });
  it("registers only draft/moderation routes, no public checkout", () => {
    const routes = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(routes).toContain("/_authenticated/seller/jasa");
    expect(routes).toContain("/_authenticated/admin/seller/jasa");
    expect(routes).not.toContain("/jasa/checkout");
  });
});

describe("marketplace service order contract (static SQL, not database execution)", () => {
  it("locks lifecycle writes behind order-first RPCs, no direct table writes", () => {
    expect(sql).toContain("CREATE TABLE public.marketplace_service_orders");
    expect(sql).toContain("CREATE TABLE public.marketplace_service_deliveries");
    expect(sql).toContain("CREATE TABLE public.marketplace_service_events");
    expect(sql).toContain("UNIQUE (order_id, version)");
    expect(sql).toContain(
      "ALTER TABLE public.marketplace_service_orders ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).not.toMatch(
      /GRANT (INSERT|UPDATE|DELETE|ALL) ON public.marketplace_service_(orders|deliveries|events) TO authenticated/,
    );
    for (const rpc of [
      "approve_service_requirements",
      "submit_service_delivery",
      "request_service_revision",
      "accept_service_delivery",
      "open_service_complaint",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${rpc}`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${rpc}`);
    }
    expect(sql).toContain("WHERE owner_id = v_user FOR SHARE");
    expect(sql).toContain("user_id = v_user FOR UPDATE");
  });
  it("accepts only the latest delivery by the buyer and credits once", () => {
    const accept = sql.slice(
      sql.indexOf("CREATE FUNCTION public.accept_service_delivery"),
      sql.indexOf("CREATE FUNCTION public.open_service_complaint"),
    );
    expect(accept).toContain("user_id = v_user FOR UPDATE");
    expect(accept).toContain("already_accepted");
    expect(accept).toContain("DELIVERY_SUPERSEDED");
    expect(accept).toContain("COMPLAINT_ACTIVE");
    expect(accept).toContain("work_state <> 'delivered'");
    expect(accept).toContain("latest_delivery_id IS DISTINCT FROM _delivery_id");
    expect(accept).toContain("v_credit := public.credit_seller_earnings(_order_id)");
    expect(accept).not.toContain("has_permission");
  });
  it("freezes release while a complaint is open and restores prior state", () => {
    const complaint = sql.slice(
      sql.indexOf("CREATE FUNCTION public.open_service_complaint"),
      sql.indexOf("-- Keputusan admin atas komplain"),
    );
    expect(complaint).toContain("ALREADY_ACCEPTED");
    expect(complaint).toContain("prior_work_state");
    expect(complaint).toContain("prior_order_status = v_order.status");
    const resolve = sql.slice(
      sql.indexOf("CREATE FUNCTION public.resolve_service_complaint"),
      sql.indexOf("-- Daftar pesanan jasa"),
    );
    expect(resolve).toContain("'resume','refund'");
    expect(resolve).toContain("orders.update");
    expect(resolve).toContain("refunds.approve");
    expect(resolve).toContain("review_refund");
    expect(resolve).toContain("notify_payment_staff");
  });
  it("keeps delivery immutable, versioned and HTTPS-only without credentials", () => {
    const submit = sql.slice(
      sql.indexOf("CREATE FUNCTION public.submit_service_delivery"),
      sql.indexOf("-- Buyer meminta revisi"),
    );
    expect(submit).toContain("_url !~ '^https://'");
    expect(submit).toContain("_url ~ '^https://[^/@]*@'");
    expect(submit).toContain("REQUIREMENTS_NOT_APPROVED");
    expect(submit).toContain("COALESCE(MAX(version), 0) + 1");
    expect(sql).toContain("CHECK ((kind = 'link') = (url IS NOT NULL))");
  });
});

describe("marketplace service finance dispatch (static SQL, not database execution)", () => {
  const finance = readFileSync(
    "supabase/migrations/20261003120000_marketplace_service_finance_dispatch.sql",
    "utf8",
  );
  it("requires acceptance before any marketplace service credit", () => {
    const credit = finance.slice(
      finance.indexOf("CREATE OR REPLACE FUNCTION public.credit_seller_earnings"),
      finance.indexOf("CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid"),
    );
    expect(credit).toContain("o.order_type = 'marketplace_service'");
    expect(credit).toContain("ACCEPTANCE_REQUIRED");
    expect(credit).toContain("complaint_open = false");
    expect(credit).toContain(
      "GRANT EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) TO service_role",
    );
    expect(credit).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.credit_seller_earnings(uuid) TO authenticated",
    );
  });
  it("never credits a service order from the paid/completed trigger", () => {
    const trigger = finance.slice(
      finance.indexOf("CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid"),
      finance.indexOf("CREATE OR REPLACE FUNCTION public.verify_manual_payment"),
    );
    const servicePart = trigger.slice(
      trigger.indexOf("IF NEW.order_type = 'marketplace_service'"),
      trigger.indexOf("ELSIF NEW.order_type = 'digital_product'"),
    );
    expect(servicePart).toContain("RETURN NEW");
    expect(servicePart).not.toContain("credit_seller_earnings");
  });
  it("dispatches service payments before operator fallback without entitlements or assignment", () => {
    for (const dispatcher of ["verify_manual_payment", "settle_gateway_payment"]) {
      const body = finance.slice(
        finance.indexOf(`CREATE OR REPLACE FUNCTION public.${dispatcher}`),
      );
      const branch = body.slice(
        body.indexOf("v_order.order_type = 'marketplace_service'"),
        body.indexOf("v_order.order_type = 'digital_product'"),
      );
      expect(branch).toContain("activate_paid_marketplace_service");
      expect(branch).not.toContain("digital_entitlements");
      expect(branch).not.toContain("assign_operator");
      expect(branch).not.toContain("digital_order_receipts");
    }
  });
  it("restores stored service state on refund rejection instead of completed fallback", () => {
    const review = finance.slice(
      finance.indexOf("CREATE OR REPLACE FUNCTION public.review_refund"),
      finance.indexOf("CREATE OR REPLACE FUNCTION public.request_refund"),
    );
    expect(review.indexOf("public.marketplace_service_orders")).toBeGreaterThan(-1);
    expect(review.indexOf("public.marketplace_service_orders")).toBeLessThan(
      review.indexOf("public.digital_order_receipts"),
    );
    expect(review).toContain("prior_order_status IN ('paid','completed')");
    expect(review).toContain("COALESCE(v_restore,'completed')");
  });
  it("marks refunded service contracts and blocks post-acceptance direct refunds", () => {
    const process = finance.slice(
      finance.indexOf("CREATE OR REPLACE FUNCTION public.process_refund"),
      finance.indexOf("CREATE OR REPLACE FUNCTION public.review_refund"),
    );
    expect(process).toContain("work_state = 'refunded'");
    const request = finance.slice(
      finance.indexOf("CREATE OR REPLACE FUNCTION public.request_refund"),
    );
    expect(request).toContain("SERVICE_POST_ACCEPTANCE_REFUND_UNAVAILABLE");
    expect(request).toContain("accepted_delivery_id IS NOT NULL");
  });
  it("keeps the disabled checkout hard stop and digital legacy intact", () => {
    expect(finance).toContain("CREATE FUNCTION public.activate_paid_marketplace_service");
    expect(finance).toContain("SERVICE_ORDER_CONTRACT_MISSING");
    expect(finance).toContain("ELSIF o.status NOT IN ('paid','completed') THEN");
    expect(finance).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public.activate_paid_marketplace_service/,
    );
  });
});
