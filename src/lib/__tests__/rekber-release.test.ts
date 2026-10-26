import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rpcErrorMessage } from "../transaction.server";

const sql = readFileSync("supabase/migrations/20261002130000_digital_seller_funds_release.sql", "utf8");
const credit = sql.slice(0, sql.indexOf("CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid"));
const refund = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.process_refund"), sql.indexOf("CREATE OR REPLACE FUNCTION public.review_refund"));

describe("rekber release source regression", () => {
  it("requires buyer acceptance, payment and no active refund at the credit boundary", () => {
    expect(credit).toContain("FOR UPDATE");
    expect(credit).toContain("accepted_by = o.user_id");
    expect(credit).toContain("RECEIPT_REQUIRED");
    expect(credit).toContain("NO_PAID_PAYMENT");
    expect(credit).toContain("REFUND_ACTIVE");
    expect(credit).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
  });
  it("credits new digital orders only on completed with an accepted receipt", () => {
    const trigger = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.trg_credit_seller_on_paid"), sql.indexOf("CREATE OR REPLACE FUNCTION public.get_store_finances"));
    expect(trigger).toContain("NEW.status = 'completed'");
    expect(trigger).toContain("status = 'accepted'");
    expect(trigger).toContain("ELSIF NEW.status IN ('paid','completed')");
  });
  it("does not debit unreleased sales and serializes refund decisions on the order", () => {
    expect(refund.indexOf("FROM public.orders WHERE id = v_order_id FOR UPDATE")).toBeLessThan(refund.indexOf("FROM public.refunds WHERE id = _refund_id AND order_id = o.id FOR UPDATE"));
    expect(refund).toContain("IF s.remaining > 0 THEN");
    expect(refund).toContain("source_type = 'sale'");
    expect(refund).toContain("duplicate',true");
    expect(refund).toContain("REFUND_ALLOCATION_REQUIRED");
  });
  it("keeps held funds outside available and reserves released refunds once", () => {
    expect(sql).toContain("'available_balance',v_ledger-v_reserved");
    expect(sql).toContain("'held_receipt',v_held");
    expect(sql).toContain("source_type IN ('refund','reversal')");
    expect(sql).toContain("'finances', public.get_store_finances(_store_id)");
    expect(sql).toContain("public.get_store_balance(s.id)");
  });
  it("returns actionable errors instead of generic failures", () => {
    expect(rpcErrorMessage("RECEIPT_REQUIRED")).toContain("penerimaan");
    expect(rpcErrorMessage("REFUND_ALLOCATION_REQUIRED")).toContain("alokasi");
  });
  it("keeps finance errors visible and uses aggregate released earnings", () => {
    const source = readFileSync("src/lib/seller.functions.ts", "utf8");
    expect(source).toContain("balance.error || !balance.data || ledger.error");
    expect(source).toContain("Number(finances.released_total)");
    expect(source).toContain("finances.released_trend");
    expect(source).not.toContain(".limit(200)");
    expect(sql).toContain("'released_trend'");
    const ui = readFileSync("src/routes/_authenticated/seller.keuangan.tsx", "utf8");
    expect(ui.indexOf("if (isPending) return")).toBeLessThan(ui.indexOf("const balance ="));
    expect(ui).toContain("Ditahan, menunggu penerimaan");
    expect(ui).toContain("Cadangan refund aktif");
  });
});
