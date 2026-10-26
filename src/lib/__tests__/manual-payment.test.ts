import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canSubmitManualProof,
  isManualPayment,
  PROOF_MAX_BYTES,
  PROOF_MIME_TYPES,
  proofFileError,
} from "../manual-payment";

const payment = {
  provider: "manual",
  method: "dana",
  status: "waiting_payment",
  expired_at: "2026-10-03T00:00:00Z",
  reupload_count: 0,
};
const now = Date.parse("2026-10-02T00:00:00Z");
const sql = readFileSync("supabase/migrations/20261002110000_manual_payment_boundary.sql", "utf8");
const submitSql = sql
  .split("CREATE OR REPLACE FUNCTION public.submit_payment_proof")[1]
  .split("CREATE OR REPLACE FUNCTION public.verify_manual_payment")[0];
const verifySql = sql.split("CREATE OR REPLACE FUNCTION public.verify_manual_payment")[1];

describe("manual payment eligibility and proof validation", () => {
  it.each(PROOF_MIME_TYPES)("accepts %s at the exact size boundary", (type) => {
    expect(proofFileError({ size: PROOF_MAX_BYTES, type })).toBeNull();
  });
  it("rejects empty, oversize and unsupported files", () => {
    expect(proofFileError({ size: 0, type: "image/png" })).not.toBeNull();
    expect(proofFileError({ size: PROOF_MAX_BYTES + 1, type: "image/png" })).not.toBeNull();
    expect(proofFileError({ size: 100, type: "application/zip" })).not.toBeNull();
  });
  it("allows manual initial submission and three reuploads", () => {
    for (const reupload_count of [0, 1, 2, 3])
      expect(canSubmitManualProof({ ...payment, reupload_count }, "awaiting_payment", now)).toBe(
        true,
      );
    expect(canSubmitManualProof({ ...payment, reupload_count: 4 }, "awaiting_payment", now)).toBe(
      false,
    );
  });
  it("rejects gateway, paid, review, other order states and expiry", () => {
    expect(isManualPayment({ provider: "sumopod", method: "qris" })).toBe(false);
    for (const changes of [
      { provider: "sumopod", method: "qris" },
      { status: "paid" },
      { status: "waiting_verification" },
      { expired_at: "2026-10-02T00:00:00Z" },
      { expired_at: "invalid" },
    ])
      expect(canSubmitManualProof({ ...payment, ...changes }, "awaiting_payment", now)).toBe(false);
    expect(canSubmitManualProof(payment, "cancelled", now)).toBe(false);
    expect(canSubmitManualProof({ ...payment, status: "rejected" }, "awaiting_payment", now)).toBe(
      true,
    );
  });
});

describe("manual SQL boundary regression (static, not DB integration)", () => {
  it("restricts both RPCs to manual/DANA", () => {
    for (const body of [submitSql, verifySql])
      expect(body).toContain("v_pay.provider <> 'manual' OR v_pay.method <> 'dana'");
  });
  it("binds submissions to owner/payment and authoritative object metadata", () => {
    expect(submitSql).toContain("v_pay.user_id <> v_user");
    expect(submitSql).toContain("v_user::text || '/' || _payment_id::text || '/%'");
    expect(submitSql).toContain("FROM storage.objects");
    expect(submitSql).toContain("_size_bytes IS DISTINCT FROM v_size");
    expect(submitSql).toContain("_mime_type IS DISTINCT FROM v_mime");
    expect(submitSql).toContain("v_pay.reupload_count > v_limit");
    expect(sql).toContain("REVOKE INSERT ON public.manual_payment_proofs FROM authenticated, anon");
  });
  it("proof submission never grants entitlement, paid status, or seller earnings", () => {
    expect(submitSql).toContain("status = 'waiting_verification'");
    expect(submitSql).not.toContain("digital_entitlements");
    expect(submitSql).not.toContain("status = 'paid'");
    expect(submitSql).not.toContain("seller_ledger");
  });
  it("approval needs submitted proof and exact remaining payment amount", () => {
    expect(verifySql).toContain("status = 'submitted'");
    expect(verifySql).toContain("RAISE EXCEPTION 'PROOF_REQUIRED'");
    expect(verifySql).toContain(
      "v_proof_row.amount_claimed IS DISTINCT FROM v_pay.expected_amount",
    );
    expect(verifySql.indexOf("RAISE EXCEPTION 'AMOUNT_MISMATCH'")).toBeLessThan(
      verifySql.indexOf("UPDATE public.payments SET status = 'paid'"),
    );
  });
  it("preserves existing entitlement, fulfillment, ledger-trigger states and audit effects", () => {
    for (const snippet of [
      "ON CONFLICT (order_item_id) DO NOTHING",
      "assign_unique_files_for_order",
      "status = 'completed'",
      "status = 'academic_review'",
      "status = 'waiting_assignment'",
      "public.payment_verifications",
      "public.audit_logs",
      "public.order_status_histories",
    ])
      expect(verifySql).toContain(snippet);
    expect(sql).not.toContain("CREATE TRIGGER");
    expect(sql).not.toContain("INSERT INTO public.seller_ledger");
  });
  it("does not silently change the existing fulfillment branch", () => {
    const old = readFileSync(
      "supabase/migrations/20260807132231_2131cb3d-9f81-45e2-8c4a-cb71a4933eed.sql",
      "utf8",
    );
    const body = (text: string) =>
      text
        .slice(
          text.indexOf("IF _decision = 'approved' THEN\n    v_new_pay"),
          text.indexOf("END;", text.indexOf("IF _decision = 'approved' THEN\n    v_new_pay")),
        )
        .replace(/\s+/g, " ");
    expect(body(verifySql)).toBe(body(old));
  });
  it("uses a private bounded bucket and conditional cross-rail gateway write", () => {
    expect(sql).toContain("'payment-proofs', 'payment-proofs', false, 5242880");
    const gateway = readFileSync("src/lib/payments.functions.ts", "utf8");
    expect(gateway).toContain('.eq("status", payment.status)');
    expect(gateway).toContain('.eq("provider", payment.provider)');
    expect(gateway).toContain('.eq("expected_amount", payment.expected_amount)');
    expect(gateway).toContain("updateError || !updated");
  });
});
