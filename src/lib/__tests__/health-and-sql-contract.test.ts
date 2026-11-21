import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLimit = vi.fn();
const mockSelect = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("../supabase-public.server", () => ({
  createPublicClient: () => ({ from: mockFrom }),
}));

import { checkAppHealth } from "../health.server";

describe("GET /api/health", () => {
  beforeEach(() => {
    mockLimit.mockReset();
  });

  it("returns 200 healthy when public Supabase query succeeds", async () => {
    mockLimit.mockResolvedValue({ data: [{ key: "store_name" }], error: null });
    const res = await checkAppHealth();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("healthy");
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns 503 degraded without leaking internal error details when DB fails", async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { message: "secret-internal-host.supabase.co connection refused" },
    });
    const res = await checkAppHealth();
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.status).toBe("degraded");
    expect(JSON.stringify(res.body)).not.toContain("secret-internal-host");
  });
});

describe("SQL migration security & contract checks (20261121*)", () => {
  const m1 = readFileSync("supabase/migrations/20261121132000_verified_reviews_rating_only.sql", "utf8");
  const m2 = readFileSync("supabase/migrations/20261121150000_wire_remaining_admin_settings.sql", "utf8");
  const m3 = readFileSync("supabase/migrations/20261121160000_wire_seller_and_marketplace_rules.sql", "utf8");

  it("revokes public/anon/authenticated execute on setting_text and next_invoice_number", () => {
    expect(m2).toContain("REVOKE ALL ON FUNCTION public.setting_text(text, text) FROM PUBLIC, anon, authenticated;");
    expect(m2).toContain("REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon, authenticated;");
  });

  it("locks SECURITY DEFINER search_path = public across new functions", () => {
    expect(m1).toContain("SET search_path = public");
    expect(m2).toContain("SET search_path = public");
    expect(m3).toContain("SET search_path = public");
  });

  it("checks marketplace_service_deliveries via latest_delivery_id instead of non-existent delivered_at", () => {
    expect(m2).toContain("v_mso.latest_delivery_id");
    expect(m2).toContain("FROM public.marketplace_service_deliveries");
    expect(m2).not.toContain("v_mso.delivered_at");
  });

  it("guards partial_refund with marketplace_partial_refund setting and grants execute only to authenticated", () => {
    expect(m3).toContain("public.setting_bool('marketplace_partial_refund', false)");
    expect(m3).toContain("REVOKE ALL ON FUNCTION public.resolve_service_complaint(uuid, text, text, bigint) FROM PUBLIC, anon, authenticated;");
    expect(m3).toContain("GRANT EXECUTE ON FUNCTION public.resolve_service_complaint(uuid, text, text, bigint) TO authenticated;");
  });
});
