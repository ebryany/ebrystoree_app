import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SETTING_SECTIONS } from "../website-settings";

const sql = readFileSync(
  "supabase/migrations/20261027100000_seller_withdrawal_system.sql",
  "utf8",
);

const slice = (from: string, to = "\nCREATE OR REPLACE FUNCTION") => {
  const start = sql.indexOf(from);
  const end = sql.indexOf(to, start + 1);
  return sql.slice(start, end === -1 ? sql.length : end);
};

describe("withdrawal SQL contract — atomicity", () => {
  it("locks the store balance before reading it (advisory lock precedes get_store_balance)", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn).toContain("pg_advisory_xact_lock(710006, hashtext(v_store::text))");
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("get_store_balance"));
  });

  it("re-checks idempotency inside the lock and returns the same withdrawal on retry", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn.match(/SELECT \* INTO v_existing FROM public.withdrawals WHERE idempotency_key/g)?.length).toBe(2);
    expect(fn).toContain("'duplicate', true");
  });

  it("reserves via an append-only payout debit and reverses on cancel/reject — never UPDATEs ledger", () => {
    expect(sql).toContain("'payout', v_id");
    expect(sql).toContain("'payout:' || w.id::text || ':reversal'");
    // Ledger tidak pernah dimutasi langsung: hanya INSERT.
    expect(sql).not.toMatch(/UPDATE public\.seller_ledger/);
    expect(sql).not.toMatch(/DELETE FROM public\.seller_ledger/);
  });

  it("inserts the withdrawal and the ledger entry in the same transaction (fail-loud, no ON CONFLICT on ledger)", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn).toContain("INSERT INTO public.withdrawals");
    expect(fn).toContain("INSERT INTO public.seller_ledger");
    expect(fn).toContain("'payout:' || v_id::text || ':reserve'");
    const reserveInsert = fn.slice(
      fn.indexOf("INSERT INTO public.seller_ledger"),
      fn.indexOf("INSERT INTO public.withdrawal_events"),
    );
    expect(reserveInsert).not.toContain("ON CONFLICT");
  });

  it("checks funds against available_balance after the lock", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("INSUFFICIENT_BALANCE"));
  });
});

describe("withdrawal SQL contract — policy & fee", () => {
  it("moves the existing minimum setting to Rp5.000 without creating a duplicate key", () => {
    // Upsert: baris setting bisa belum ada di system_settings; nilai kustom
    // Owner (≠ 50000) tidak ditimpa berkat guard WHERE pada DO UPDATE.
    expect(sql).toContain("VALUES ('marketplace_min_payout', '5000'::jsonb");
    expect(sql).toContain("WHERE public.system_settings.value #>> '{}' = '50000'");
    // Hanya satu upsert yang menyentuh key ini; sisanya pembacaan setting_int.
    expect(sql.match(/'marketplace_min_payout', '5000'::jsonb/g)?.length).toBe(1);
    expect(sql.match(/setting_int\('marketplace_min_payout'/g)?.length).toBe(2);
  });

  it("seeds the 15% fee as 1500 basis points", () => {
    expect(sql).toContain("'marketplace_withdrawal_fee_bps', '1500'::jsonb");
  });

  it("reads policy server-side with defaults, never trusting the client", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn).toContain("public.setting_int('marketplace_min_payout', 5000)");
    expect(fn).toContain("public.setting_int('marketplace_withdrawal_fee_bps', 1500)");
  });

  it("hard-caps fee_bps in an immutable CHECK (CHECK cannot read settings)", () => {
    expect(sql).toContain("CHECK (fee_bps BETWEEN 0 AND 5000)");
  });

  it("snapshots fee and destination so later changes cannot rewrite history", () => {
    expect(sql).toContain("fee_bps integer NOT NULL");
    expect(sql).toContain("bank_account_number text NOT NULL");
    expect(sql).toContain("bank_account_holder text NOT NULL");
  });

  it("rejects amounts below the configured minimum and above the available balance", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn).toContain("BELOW_MINIMUM");
    expect(fn).toContain("INSUFFICIENT_BALANCE");
    expect(fn).toContain("IF v_gross < v_min THEN RAISE EXCEPTION 'BELOW_MINIMUM'");
  });
});

describe("withdrawal SQL contract — feature gate & lifecycle", () => {
  it("gates real payouts behind feature_manual_payout which defaults to OFF", () => {
    expect(sql).toContain("'feature_manual_payout', 'false'::jsonb");
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    expect(fn).toContain("FEATURE_DISABLED");
    expect(fn).toContain("key = 'feature_manual_payout'");
  });

  it("defines the full state machine as a CHECK", () => {
    for (const status of [
      "requested",
      "approved",
      "transferred",
      "completed",
      "rejected",
      "cancelled",
      "needs_reconciliation",
    ]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).toContain(
      "('requested','approved','transferred','completed','rejected','cancelled','needs_reconciliation')",
    );
  });

  it("enforces state transition guards in every lifecycle RPC", () => {
    expect(slice("CREATE OR REPLACE FUNCTION public.cancel_own_withdrawal")).toContain(
      "w.status NOT IN ('requested','approved')",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.review_withdrawal")).toContain(
      "w.status <> 'requested'",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.record_withdrawal_transfer")).toContain(
      "w.status <> 'approved'",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.complete_withdrawal")).toContain(
      "w.status <> 'transferred'",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.mark_withdrawal_reconciliation")).toContain(
      "w.status <> 'transferred'",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.resolve_withdrawal_reconciliation")).toContain(
      "w.status <> 'needs_reconciliation'",
    );
  });

  it("never auto-reverses an uncertain transfer — resolution is manual and authorized", () => {
    const mark = slice("CREATE OR REPLACE FUNCTION public.mark_withdrawal_reconciliation");
    expect(mark).not.toContain("INSERT INTO public.seller_ledger");
    const resolve = slice("CREATE OR REPLACE FUNCTION public.resolve_withdrawal_reconciliation");
    // Reversal hanya pada cabang ELSE (outcome bukan completed) yang diputuskan finance.
    expect(resolve).toContain("IF _outcome = 'completed' THEN");
    expect(resolve).toContain("ELSE");
    expect(resolve).toContain("'reversal'");
  });

  it("recognizes the fee as platform revenue only at completion", () => {
    const complete = slice("CREATE OR REPLACE FUNCTION public.complete_withdrawal");
    expect(complete).toContain("'fee_recognized', w.fee_amount");
  });

  it("creates a finance review task and notifies payout staff", () => {
    expect(sql).toContain("'review_payout', 'withdrawal'");
    expect(sql).toContain("public.notify_payout_staff");
  });

  it("persists notifications inside the withdrawal transaction (staff + seller receipt)", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    // Notifikasi staff DAN tanda terima seller di dalam transaksi yang sama:
    // reservasi gagal = notifikasi ikut batal, tidak ada notifikasi palsu.
    expect(fn).toContain("public.notify_payout_staff('payout.requested'");
    expect(fn).toContain("INSERT INTO public.notifications");
    expect(fn).toContain("'payout.requested', 'Pengajuan penarikan terkirim'");
  });

  it("guards refund interplay: payout entries are order-agnostic so process_refund math is untouched", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.request_withdrawal");
    // Kolom order_id tidak ada pada INSERT ledger payout (NULL) — debit refund
    // process_refund menghitung sisa per-order dan tidak melihat baris payout.
    expect(fn).not.toMatch(/INSERT INTO public\.seller_ledger[\s\S]*?order_id/);
  });
});

describe("withdrawal SQL contract — authorization", () => {
  it("requires explicit payout permissions for every finance RPC", () => {
    expect(slice("CREATE OR REPLACE FUNCTION public.review_withdrawal")).toContain(
      "public.has_permission(v_user, 'payouts.approve')",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.record_withdrawal_transfer")).toContain(
      "public.has_permission(v_user, 'payouts.process')",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.complete_withdrawal")).toContain(
      "public.has_permission(v_user, 'payouts.process')",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.mark_withdrawal_reconciliation")).toContain(
      "public.has_permission(v_user, 'payouts.process')",
    );
    expect(slice("CREATE OR REPLACE FUNCTION public.resolve_withdrawal_reconciliation")).toContain(
      "public.has_permission(v_user, 'payouts.approve')",
    );
  });

  it("registers and grants the payout permissions to finance and admin", () => {
    for (const key of ["payouts.view", "payouts.approve", "payouts.process"]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toContain("('finance','payouts.view')");
    expect(sql).toContain("('admin','payouts.process')");
  });

  it("blocks self-approval: a store owner can never process their own payout", () => {
    for (const fn of [
      "CREATE OR REPLACE FUNCTION public.review_withdrawal",
      "CREATE OR REPLACE FUNCTION public.record_withdrawal_transfer",
      "CREATE OR REPLACE FUNCTION public.complete_withdrawal",
      "CREATE OR REPLACE FUNCTION public.mark_withdrawal_reconciliation",
      "CREATE OR REPLACE FUNCTION public.resolve_withdrawal_reconciliation",
    ]) {
      expect(slice(fn)).toContain("SELF_APPROVAL_FORBIDDEN");
    }
  });

  it("keeps seller data isolated with RLS on all three tables", () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)?.length).toBe(3);
    expect(sql).toContain("USING (store_id = public.my_store_id())");
    expect(sql).toContain("public.has_permission(auth.uid(), 'payouts.view')");
    // Mutasi hanya lewat SECURITY DEFINER: tidak ada INSERT/UPDATE untuk authenticated.
    expect(sql.match(/GRANT SELECT ON public\.(withdrawals|seller_bank_accounts|withdrawal_events) TO authenticated;/g)?.length).toBe(3);
    expect(sql).not.toMatch(/GRANT INSERT ON public\.withdrawals TO authenticated/);
    expect(sql).not.toMatch(/GRANT UPDATE ON public\.withdrawals TO authenticated/);
  });

  it("scopes every function with a safe search_path", () => {
    expect((sql.match(/SET search_path = public/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it("validates the bank account format server-side", () => {
    expect(sql).toContain("regexp_replace(btrim(account_number), '[ -]', '', 'g') ~ '^[0-9]{6,25}$'");
    const save = slice("CREATE OR REPLACE FUNCTION public.save_seller_bank_account");
    expect(save).toContain("INVALID_BANK_ACCOUNT");
    expect(save).toContain("write_audit_log");
  });

  it("requires a bank reference when recording a manual transfer", () => {
    const fn = slice("CREATE OR REPLACE FUNCTION public.record_withdrawal_transfer");
    expect(fn).toContain("REFERENCE_REQUIRED");
    expect(fn).toContain("w.bank_reference IS NOT NULL");
  });
});

describe("withdrawal settings registry (static contract)", () => {
  const marketplace = SETTING_SECTIONS.find((s) => s.id === "marketplace");
  const fitur = SETTING_SECTIONS.find((s) => s.id === "fitur");

  it("keeps one minimum payout key at the new policy value", () => {
    const field = marketplace?.fields.find((f) => f.key === "marketplace_min_payout");
    expect(field?.default).toBe(5000);
  });

  it("adds the withdrawal fee field with validated bounds", () => {
    const field = marketplace?.fields.find((f) => f.key === "marketplace_withdrawal_fee_bps");
    expect(field?.default).toBe(1500);
    expect(field?.min).toBe(0);
    expect(field?.max).toBe(5000);
  });

  it("adds the manual payout feature flag defaulting to OFF with a legal-warning confirm", () => {
    const field = fitur?.fields.find((f) => f.key === "feature_manual_payout");
    expect(field?.default).toBe(false);
    expect(field?.confirm).toContain("legal");
  });
});
