import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { rpcErrorMessage } from "@/lib/transaction.server";
import { requireMcpPermission, safeMcpError } from "@/lib/mcp/supabase";

const migrationSql = readFileSync(
  "supabase/migrations/20261124120000_backend_security_hardening.sql",
  "utf8",
);

const sqlSlice = (from: string, to = "\nCREATE OR REPLACE FUNCTION") => {
  const start = migrationSql.indexOf(from);
  const end = migrationSql.indexOf(to, start + 1);
  return migrationSql.slice(start, end === -1 ? migrationSql.length : end);
};

function makeMcpCtx(overrides?: Partial<{ auth: boolean; token: string; userId: string }>) {
  return {
    isAuthenticated: () => overrides?.auth ?? true,
    getToken: () => overrides?.token ?? "test-oauth-jwt",
    getUserId: () => overrides?.userId ?? "11111111-1111-4111-8111-111111111111",
  } as any;
}

function firstText(res: any): string {
  return String(res?.content?.[0]?.text ?? "");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Backend Security Hardening — Error Sanitization & MCP Authz Helpers", () => {
  it("maps new transaction RPC error tokens and hides unmapped database details", () => {
    expect(rpcErrorMessage("SELF_APPROVAL_FORBIDDEN")).toContain("sendiri");
    expect(rpcErrorMessage("FEATURE_DISABLED")).toContain("dinonaktifkan");
    expect(rpcErrorMessage("INVALID_REFUND_AMOUNT")).toContain("Nominal refund");
    expect(rpcErrorMessage("PROOF_ALREADY_SUBMITTED")).toContain("sudah dikirim");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = rpcErrorMessage(
      'ERROR: 23503: insert or update on table "credit_topups" violates foreign key constraint "credit_topups_user_id_fkey"',
    );
    expect(out).toBe("Terjadi kesalahan pada server. Coba lagi.");
    expect(out).not.toContain("credit_topups");
    expect(out).not.toContain("fkey");
    expect(spy).toHaveBeenCalled();
  });

  it("sanitizes raw PostgreSQL errors in safeMcpError while preserving safe domain messages", () => {
    const known = safeMcpError("test", { message: "SELF_APPROVAL_FORBIDDEN" });
    expect(known.isError).toBe(true);
    expect(known.content[0]?.text).toContain("milik sendiri");

    const rls = safeMcpError("test", {
      code: "42501",
      message: 'new row violates row-level security policy for table "system_settings"',
    });
    expect(rls.isError).toBe(true);
    expect(rls.content[0]?.text).not.toContain("system_settings");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = safeMcpError("test", {
      message: 'column "requested_by" of relation "refunds" does not exist',
    });
    expect(raw.isError).toBe(true);
    expect(raw.content[0]?.text).not.toContain("requested_by");
    expect(raw.content[0]?.text).not.toContain("refunds");
    expect(spy).toHaveBeenCalled();
  });

  it("enforces requireMcpPermission via has_permission with super_admin fallback", async () => {
    const rpcAllow = vi.fn().mockResolvedValueOnce({ data: true, error: null });
    expect(await requireMcpPermission({ rpc: rpcAllow }, makeMcpCtx(), "products.update")).toBeNull();
    expect(rpcAllow).toHaveBeenCalledWith("has_permission", {
      _user_id: "11111111-1111-4111-8111-111111111111",
      _permission: "products.update",
    });

    const rpcSuper = vi
      .fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    expect(await requireMcpPermission({ rpc: rpcSuper }, makeMcpCtx(), "settings.manage")).toBeNull();

    const rpcDeny = vi
      .fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const denied = await requireMcpPermission({ rpc: rpcDeny }, makeMcpCtx(), "settings.manage");
    expect(denied?.isError).toBe(true);
    expect(denied?.content[0]?.text).toContain("settings.manage");
  });
});

describe("Backend Security Hardening — MCP Tools Behavioral Regression (#2, #4, #7, #9, #10)", () => {
  it("#2 verify_manual_payment maps approve/reject/request_reupload to SQL enum values and sanitizes errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { payment_status: "paid" }, error: null });
    vi.doMock("@/lib/mcp/supabase", async (orig) => {
      const actual = (await orig()) as Record<string, unknown>;
      return {
        ...actual,
        supabaseForUser: () => ({ rpc }),
        enforceMcpRateLimit: vi.fn().mockResolvedValue(null),
      };
    });

    const { default: tool } = await import("@/lib/mcp/tools/verify-payment");
    const paymentId = "22222222-2222-4222-8222-222222222222";

    await tool.handler(
      { payment_id: paymentId, decision: "approve", reason: undefined },
      makeMcpCtx(),
    );
    expect(rpc).toHaveBeenLastCalledWith("verify_manual_payment", {
      _payment_id: paymentId,
      _decision: "approved",
      _reason: null,
    });

    await tool.handler(
      { payment_id: paymentId, decision: "reject", reason: "Nominal kurang" },
      makeMcpCtx(),
    );
    expect(rpc).toHaveBeenLastCalledWith("verify_manual_payment", {
      _payment_id: paymentId,
      _decision: "rejected",
      _reason: "Nominal kurang",
    });

    await tool.handler(
      { payment_id: paymentId, decision: "request_reupload", reason: "Foto buram" },
      makeMcpCtx(),
    );
    expect(rpc).toHaveBeenLastCalledWith("verify_manual_payment", {
      _payment_id: paymentId,
      _decision: "reupload_requested",
      _reason: "Foto buram",
    });

    // Reject without reason blocked before RPC
    rpc.mockClear();
    const noReason = await tool.handler(
      { payment_id: paymentId, decision: "reject", reason: undefined },
      makeMcpCtx(),
    );
    expect(noReason.isError).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("#4 upload_product_file rejects unauthorized callers BEFORE fetch/base64 and enforces base64 ceiling", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fromSpy = vi.fn();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: false, error: null });

    vi.doMock("@/lib/mcp/supabase", async (orig) => {
      const actual = (await orig()) as Record<string, unknown>;
      return {
        ...actual,
        supabaseForUser: () => ({ rpc, from: fromSpy }),
        enforceMcpRateLimit: vi.fn().mockResolvedValue(null),
      };
    });

    const { default: tool } = await import("@/lib/mcp/tools/upload-product-file");

    // Schema cap prevents gigabyte content_base64 allocation
    const schema = z.object(tool.inputSchema);
    const tooLong = schema.safeParse({
      product_id: "33333333-3333-4333-8333-333333333333",
      filename: "huge.bin",
      content_base64: "A".repeat(140_000_001),
    });
    expect(tooLong.success).toBe(false);

    const res = await tool.handler(
      {
        product_id: "33333333-3333-4333-8333-333333333333",
        filename: "test.pdf",
        version: "v1",
        content_base64: undefined,
        source_url: "https://example.com/file.pdf",
        mime_type: undefined,
        make_active: true,
      },
      makeMcpCtx(),
    );

    expect(res.isError).toBe(true);
    expect(firstText(res)).toContain("products.update");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("#4 manage_product_file deletes DB row before touching storage and requires products.delete", async () => {
    const removeSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    const fakeSupabase = {
      rpc,
      storage: { from: () => ({ remove: removeSpy }) },
      from: (table: string) => {
        if (table === "digital_product_files") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "44444444-4444-4444-8444-444444444444",
                    product_id: "55555555-5555-4555-8555-555555555555",
                    storage_path: "p/file.pdf",
                    version: "v1",
                    is_active: true,
                    assigned_entitlement_id: null,
                  },
                  error: null,
                }),
              }),
            }),
            delete: () => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { delivery_mode: "unique" }, error: null }),
            }),
          }),
        };
      },
    };

    vi.doMock("@/lib/mcp/supabase", async (orig) => {
      const actual = (await orig()) as Record<string, unknown>;
      return {
        ...actual,
        supabaseForUser: () => fakeSupabase,
        enforceMcpRateLimit: vi.fn().mockResolvedValue(null),
      };
    });

    const { default: tool } = await import("@/lib/mcp/tools/manage-product-file");
    const res = await tool.handler(
      { file_id: "44444444-4444-4444-8444-444444444444", action: "delete" },
      makeMcpCtx(),
    );

    expect(rpc).toHaveBeenCalledWith("has_permission", {
      _user_id: "11111111-1111-4111-8111-111111111111",
      _permission: "products.delete",
    });
    expect(res.isError).toBe(true);
    // Because DB delete returned null (e.g., allocated concurrently or RLS blocked), storage must NOT be deleted!
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("#10 update_website_settings enforces settings.manage before reading or upserting settings", async () => {
    const fromSpy = vi.fn();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: false, error: null });

    vi.doMock("@/lib/mcp/supabase", async (orig) => {
      const actual = (await orig()) as Record<string, unknown>;
      return {
        ...actual,
        supabaseForUser: () => ({ rpc, from: fromSpy }),
        enforceMcpRateLimit: vi.fn().mockResolvedValue(null),
      };
    });

    const { default: tool } = await import("@/lib/mcp/tools/update-website-settings");
    const res = await tool.handler({ values: { site_tagline: "Baru" } }, makeMcpCtx());

    expect(res.isError).toBe(true);
    expect(firstText(res)).toContain("settings.manage");
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

describe("Backend Security Hardening — SQL Migration Contract (20261124120000)", () => {
  it("#1 fixes resolve_service_complaint columns, self-approval, and refund_processing transition", () => {
    const fn = sqlSlice("CREATE OR REPLACE FUNCTION public.resolve_service_complaint");
    expect(fn).toContain("customer_id");
    expect(fn).not.toContain("requested_by");
    expect(fn).toContain("status = 'completed'");
    expect(fn).toContain("completed_at = now()");
    expect(fn).not.toContain("resolved_at");
    expect(fn).not.toContain("resolved_by");
    expect(fn).toContain("SELF_APPROVAL_FORBIDDEN");
    expect(fn).toContain("REFUND_ACTIVE");
    expect(fn).toContain("status = 'refund_processing'");
  });

  it("#3 adds atomic manual top-up RPCs with FOR UPDATE, anti self-approval, storage checks, and audit logs", () => {
    const submitFn = sqlSlice("CREATE OR REPLACE FUNCTION public.submit_manual_topup_proof");
    expect(submitFn).toContain("SECURITY DEFINER");
    expect(submitFn).toContain("FOR UPDATE");
    expect(submitFn).toContain("PAYMENT_EXPIRED");
    expect(submitFn).toContain("PROOF_ALREADY_SUBMITTED");
    expect(submitFn).toContain("FROM storage.objects");
    expect(submitFn).toContain("topup.proof_submit");

    const reviewFn = sqlSlice("CREATE OR REPLACE FUNCTION public.review_manual_topup");
    expect(reviewFn).toContain("SECURITY DEFINER");
    expect(reviewFn).toContain("FOR UPDATE");
    expect(reviewFn).toContain("SELF_APPROVAL_FORBIDDEN");
    expect(reviewFn).toContain("PROOF_REQUIRED");
    expect(reviewFn).toContain("topup.reject");
    expect(reviewFn).toContain("public.settle_credit_topup");

    const verifyFn = sqlSlice("CREATE OR REPLACE FUNCTION public.verify_manual_payment");
    expect(verifyFn).toContain("IF v_pay.user_id = v_user THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'");
  });

  it("#5 hardens request_refund, review_refund, and process_refund", () => {
    const reqFn = sqlSlice("CREATE OR REPLACE FUNCTION public.request_refund");
    expect(reqFn).toContain("key = 'feature_refund'");
    expect(reqFn).toContain("FEATURE_DISABLED");
    expect(reqFn).toContain("REFUND_ACTIVE");
    expect(reqFn).toContain("COALESCE(v_pay.paid_amount, 0) + COALESCE(v_order.credit_used, 0)");

    const revFn = sqlSlice("CREATE OR REPLACE FUNCTION public.review_refund");
    expect(revFn).toContain("IF r.customer_id = auth.uid() THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'");

    const procFn = sqlSlice("CREATE OR REPLACE FUNCTION public.process_refund");
    expect(procFn).toContain("IF r.customer_id = auth.uid() THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN'");
    expect(procFn).not.toContain("o.credit_used > 0");
  });

  it("#6 restricts cancel_own_withdrawal strictly to requested state", () => {
    const cancelFn = sqlSlice("CREATE OR REPLACE FUNCTION public.cancel_own_withdrawal");
    expect(cancelFn).toContain("IF w.status <> 'requested' THEN RAISE EXCEPTION 'INVALID_STATE'");
    expect(cancelFn).not.toContain("NOT IN ('requested', 'approved')");
  });

  it("#8, #10, #11, #12 drop direct proof insert policy, align settings RLS, guard bank account store status, and revoke financial table writes", () => {
    expect(migrationSql).toContain("DROP POLICY IF EXISTS proofs_insert_own ON public.manual_payment_proofs");
    expect(migrationSql).toContain("CREATE POLICY settings_write_admin");
    expect(migrationSql).toContain("public.has_permission(auth.uid(), 'settings.manage')");

    const bankFn = sqlSlice("CREATE OR REPLACE FUNCTION public.save_seller_bank_account");
    expect(bankFn).toContain("IF v_store_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'STORE_INACTIVE'");

    for (const table of [
      "manual_payment_proofs",
      "payment_verifications",
      "refunds",
      "orders",
      "order_items",
      "payments",
      "payment_events",
      "credit_topups",
      "credit_ledger",
      "seller_ledger",
    ]) {
      expect(migrationSql).toContain(
        `REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM anon, authenticated`,
      );
    }
  });
});

describe("Backend Security Hardening — Server Functions & UI Contract (#3, #7, #9, #11, #13)", () => {
  it("routes manual top-up submit/review via atomic RPCs and eliminates eager signed URL signing", () => {
    const src = readFileSync("src/lib/topup-manual.functions.ts", "utf8");
    expect(src).toContain('.rpc("submit_manual_topup_proof"');
    expect(src).toContain('.rpc("review_manual_topup"');
    expect(src).toContain('enforceRateLimit(context.userId, "admin.payment.decision")');
    expect(src).toContain("export const getManualTopupProofUrl =");
    expect(src).not.toContain("Gagal mengkredit saldo: ${msg");

    const listBlock = src
      .split("export const listManualTopups =")[1]
      .split("export const getManualTopupProofUrl =")[0];
    expect(listBlock).not.toContain("createSignedUrl");
    expect(listBlock).toContain("has_proof: Boolean(proof_path)");

    const topupsPage = readFileSync("src/routes/_authenticated/admin/topups.tsx", "utf8");
    expect(topupsPage).toContain("getManualTopupProofUrl");
    expect(topupsPage).toContain('window.open(res.url, "_blank", "noopener,noreferrer")');
  });

  it("enforces rate limits on refund, admin payment/refund decisions, and payout decisions", () => {
    const orders = readFileSync("src/lib/orders.functions.ts", "utf8");
    const refundBlock = orders
      .split("export const requestMyRefund =")[1]
      .split("export const getMyDigitalReceipt =")[0];
    expect(refundBlock).toContain('enforceRateLimit(context.userId, "refund.request")');

    const adminTx = readFileSync("src/lib/admin-transaction.functions.ts", "utf8");
    expect(
      adminTx.match(/enforceRateLimit\(context\.userId, "admin\.payment\.decision"\)/g)?.length,
    ).toBe(3);

    const adminPayout = readFileSync("src/lib/admin-payout.functions.ts", "utf8");
    expect(
      adminPayout.match(/enforceRateLimit\(context\.userId, "admin\.payout\.decision"\)/g)?.length,
    ).toBe(5);
    expect(adminPayout).toContain('access.permissions.includes("payouts.process")');
    expect(adminPayout).toContain("bank_account_redacted: !canViewFullBank");
    expect(adminPayout).not.toContain("clean.length > 3 ? clean");

    const seller = readFileSync("src/lib/seller.functions.ts", "utf8");
    expect(seller).not.toContain("clean.length > 3 ? clean");

    const rateLimit = readFileSync("src/lib/rate-limit.server.ts", "utf8");
    for (const bucket of ["admin.payment.decision", "mcp.upload", "mcp.mutation", "mcp.notify"]) {
      expect(rateLimit).toContain(`"${bucket}"`);
    }
  });

  it("adds audit logging & rate limiting across MCP catalog and notification tools", () => {
    for (const file of [
      "src/lib/mcp/tools/create-product.ts",
      "src/lib/mcp/tools/update-product.ts",
      "src/lib/mcp/tools/archive-product.ts",
      "src/lib/mcp/tools/manage-user-role.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("requireMcpPermission");
      expect(src).toContain("enforceMcpRateLimit");
      expect(src).toContain("writeMcpAudit");
      expect(src).toContain("safeMcpError");
    }

    for (const file of [
      "src/lib/mcp/tools/broadcast-notification.ts",
      "src/lib/mcp/tools/hermes-notify-telegram.ts",
      "src/lib/mcp/tools/review-refund.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("enforceMcpRateLimit");
    }
  });
});
