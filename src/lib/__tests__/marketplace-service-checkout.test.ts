import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { marketplaceServiceCheckoutSchema } from "../marketplace-service";

const sql = readFileSync(
  "supabase/migrations/20261003140000_marketplace_service_checkout.sql",
  "utf8",
);
const input = {
  serviceId: "00000000-0000-4000-8000-000000000001",
  idempotencyKey: "00000000-0000-4000-8000-000000000002",
  expectedVersion: 3,
  expectedTotal: 52500,
  requirements: "Brief desain pembeli",
  agreementAccepted: true,
};

describe("seller service checkout", () => {
  it("validates consent, quote, requirements and forbids injected ownership or price", () => {
    expect(marketplaceServiceCheckoutSchema.parse(input)).toEqual(input);
    for (const patch of [
      { agreementAccepted: false },
      { requirements: "     " },
      { requirements: "x".repeat(5001) },
      { expectedVersion: 0 },
      { expectedTotal: 0 },
      { expectedTotal: 1.5 },
      { idempotencyKey: "bad" },
      { price: 1 },
      { storeId: input.serviceId },
    ])
      expect(marketplaceServiceCheckoutSchema.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
  });
  it("keeps eligibility, quote and idempotency guards in the SQL transaction", () => {
    for (const guard of [
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "CHECKOUT_DISABLED",
      "SELF_PURCHASE_DENIED",
      "STALE_QUOTE",
      "IDEMPOTENCY_CONFLICT",
      "AGREEMENT_REQUIRED",
      "REQUIREMENTS_REQUIRED",
    ])
      expect(sql).toContain(guard);
    expect(sql).toContain("pg_advisory_xact_lock(710004, hashtext(_idempotency_key))");
    expect(sql).toContain("v_existing.user_id <> v_user");
    expect(sql).toContain("v_existing.service_id IS DISTINCT FROM _service_id");
    expect(sql).toContain("v_listing.status <> 'approved'");
    expect(sql).toContain("FOR SHARE OF s");
    expect(sql).toContain("kind = 'service'");
    expect(sql).toContain("_expected_total IS DISTINCT FROM v_total");
    expect(sql).toContain("REFERENCES public.marketplace_services(id)");
    expect(sql).toContain("v_listing.agreement, v_listing.version");
    expect(sql).not.toMatch(/INSERT INTO public\.(seller_ledger|credit_ledger)/);
    expect(sql).not.toContain("jsonb_typeof(jsonb_extract_path_text");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.create_marketplace_service_order(uuid,text) FROM PUBLIC, anon, authenticated",
    );
  });
  it("connects checkout to existing payment and buyer lifecycle", () => {
    const checkout = readFileSync("src/routes/_authenticated/checkout.jasa.$id.tsx", "utf8");
    expect(checkout).toContain('to: "/dashboard/pesanan/$id"');
    expect(checkout).toContain("crypto.randomUUID()");
    expect(checkout).toContain("refetchOnWindowFocus: false");
    expect(checkout).toContain("setAccepted(false)");
    const detail = readFileSync("src/routes/_authenticated/dashboard.pesanan.$id.tsx", "utf8");
    expect(detail).toContain("<MarketplaceServiceOrderDetail orderId={order.id} embedded />");
    expect(detail).toContain('enabled: data?.order?.order_type === "service"');
  });
});
