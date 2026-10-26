import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { stockCodeUrl } from "../digital-receipt";
import { rpcErrorMessage } from "../transaction.server";

const sql = readFileSync("supabase/migrations/20261002120000_digital_order_receipt.sql", "utf8");
const functionSql = (name: string) => {
  const start = sql.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(`));
  expect(start).toBeGreaterThanOrEqual(0);
  const body = sql.slice(start);
  const next = body.slice(1).search(/CREATE (?:OR REPLACE )?FUNCTION public\./);
  return next < 0 ? body : body.slice(0, next + 1);
};
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const readiness = functionSql("digital_receipt_items");
const read = functionSql("get_my_digital_receipt");
const confirm = functionSql("confirm_digital_receipt");
const code = functionSql("get_my_stock_code");

const previousSettlement = (text: string) =>
  text
    .replace(
      /v_new_order := 'completed';\s*UPDATE public\.orders SET status = 'completed', paid_at = now\(\), completed_at = now\(\) WHERE id = v_order.id;/,
      "v_new_order := 'paid'; INSERT INTO public.digital_order_receipts(order_id) VALUES(v_order.id) ON CONFLICT (order_id) DO NOTHING; UPDATE public.orders SET status = 'paid', paid_at = now(), completed_at = NULL WHERE id = v_order.id;",
    )
    .replace("v_order.user_id, 'order.completed',", "v_order.user_id, 'order.paid',")
    .replaceAll("Produk siap diunduh", "Akses produk disiapkan")
    .replace(
      "Produk tersedia di pustaka Anda.",
      "Periksa produk di pustaka Anda, lalu konfirmasikan penerimaan pada detail pesanan.",
    );

function previousFunction(path: string, name: string) {
  const old = readFileSync(path, "utf8");
  const start = old.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = old.indexOf("$function$;", old.indexOf("AS $function$", start));
  return old.slice(start, end + "$function$;".length);
}
function newDefinition(name: string) {
  const body = functionSql(name);
  return body.slice(
    0,
    body.indexOf("$function$;", body.indexOf("AS $function$")) + "$function$;".length,
  );
}

describe("stock code link safety", () => {
  it.each(["https://example.com/activate?code=123", "http://example.com/item"])(
    "permits %s",
    (value) => {
      expect(stockCodeUrl(value)).toBe(new URL(value).href);
    },
  );
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///C:/secret",
    "ftp://example.com",
    "ABC-123",
    "/relative",
    "",
  ])("keeps %s as text", (value) => {
    expect(stockCodeUrl(value)).toBeNull();
  });
  it("maps receipt failures to buyer messages", () => {
    expect(rpcErrorMessage("DELIVERY_NOT_READY")).toContain("Seluruh produk");
    expect(rpcErrorMessage("REFUND_ACTIVE")).toContain("refund");
  });
});

describe("digital receipt SQL regression (static, not DB integration)", () => {
  it("has one receipt per order, consistent acceptance fields and no legacy backfill", () => {
    expect(sql).toContain("order_id uuid PRIMARY KEY REFERENCES public.orders(id)");
    expect(sql).toContain("accepted_by IS NULL AND accepted_at IS NULL");
    expect(sql).toContain("accepted_by IS NOT NULL AND accepted_at IS NOT NULL");
    expect(sql).not.toMatch(/INSERT INTO public\.digital_order_receipts[^;]*SELECT/s);
    expect(sql).toContain("ALTER TABLE public.digital_order_receipts ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.digital_order_receipts FROM anon, authenticated");
    expect(sql).toContain("o.user_id = auth.uid()");
  });
  it("requires owner and blocks direct internal readiness calls", () => {
    expect(read).toContain("user_id = auth.uid()");
    expect(confirm).toContain("o.user_id <> auth.uid()");
    expect(code).toContain("user_id = auth.uid()");
    for (const name of ["get_my_digital_receipt", "confirm_digital_receipt", "get_my_stock_code"])
      expect(functionSql(name)).toContain(
        `REVOKE ALL ON FUNCTION public.${name}(uuid) FROM PUBLIC, anon`,
      );
    expect(readiness).toContain("FROM PUBLIC, anon, authenticated");
  });
  it("binds readiness to the purchased item, entitlement and mode snapshot", () => {
    for (const snippet of [
      "de.product_id = oi.product_id",
      "de.user_id = o.user_id",
      "de.revoked_at IS NULL",
      "de.valid_until > now()",
      "de.order_item_id = oi.id AND de.order_id = o.id",
      "COALESCE(oi.metadata->>'delivery_mode', p.delivery_mode, 'shared') = p.delivery_mode",
    ])
      expect(readiness).toContain(snippet);
    expect(readiness).toContain("ELSE false");
  });
  it("requires actual storage objects and exact unique/code assignment", () => {
    expect(readiness).toContain("so.bucket_id = 'product-files'");
    expect(readiness).toContain("so.name = f.storage_path");
    expect(readiness).toContain("f.assigned_entitlement_id = de.id AND f.is_active");
    expect(readiness).toContain("ORDER BY f.created_at DESC LIMIT 1");
    expect(readiness).toContain(
      "c.product_id = de.product_id AND c.assigned_entitlement_id = de.id",
    );
    expect(readiness).toContain("c.status = 'assigned' AND length(btrim(c.code)) > 0");
    expect(readiness).toContain("c.expires_at > now()");
    expect(readiness).not.toContain("consume_download");
    expect(readiness).not.toContain("download_count");
    expect(readiness).not.toContain("claim_stock_code");
  });
  it("confirmation locks the order, verifies every item, paid payment and inactive refund", () => {
    expect(confirm).toContain("WHERE id = _order_id FOR UPDATE");
    expect(confirm).toContain("WHERE order_id = o.id FOR UPDATE");
    expect(confirm).toContain("count(*) > 0 AND bool_and(i.ready)");
    expect(confirm).toContain("o.status <> 'paid' OR r.status <> 'pending'");
    expect(confirm).toContain("RAISE EXCEPTION 'NO_PAID_PAYMENT'");
    expect(confirm).toContain("RAISE EXCEPTION 'REFUND_ACTIVE'");
    expect(confirm).toContain("RAISE EXCEPTION 'DELIVERY_NOT_READY'");
    expect(confirm.indexOf("RAISE EXCEPTION 'DELIVERY_NOT_READY'")).toBeLessThan(
      confirm.indexOf("UPDATE public.digital_order_receipts"),
    );
    expect(read).toContain(
      "o.status = 'paid' AND r.status = 'pending' AND v_ready AND NOT v_refund",
    );
  });
  it("keeps duplicate confirmation harmless and records buyer acceptance", () => {
    expect(confirm).toContain("r.status = 'accepted' AND o.status = 'completed'");
    expect(confirm).toContain("'duplicate',true");
    expect(confirm).toContain("accepted_by = auth.uid(), accepted_at = now()");
    expect(confirm).toContain("status = 'completed', completed_at = now()");
    expect(confirm).toContain("'customer','Pembeli mengonfirmasi");
    expect(confirm).toContain("write_audit_log('order.receipt_accepted'");
    expect(confirm).not.toContain("seller_ledger");
    expect(confirm).not.toContain("credit_seller_earnings");
    expect(sql).not.toContain("CREATE TRIGGER");
    expect(sql).not.toContain("refund_window_days");
  });
  it("code access never consumes quota or exposes unassigned/expired stock", () => {
    for (const snippet of [
      "RAISE EXCEPTION 'REVOKED'",
      "RAISE EXCEPTION 'EXPIRED'",
      "p.delivery_mode = 'code'",
      "oi.order_id = e.order_id",
      "oi.product_id = e.product_id",
      "c.assigned_entitlement_id = e.id",
      "c.status = 'assigned'",
      "c.expires_at > now()",
    ])
      expect(code).toContain(snippet);
    expect(code).not.toContain("claim_stock_code");
    expect(code).not.toContain("download_count");
  });
  it.each([
    ["verify_manual_payment", "supabase/migrations/20261002110000_manual_payment_boundary.sql"],
    [
      "settle_gateway_payment",
      "supabase/migrations/20260816165151_cba59ca4-cb03-45e4-8671-5f0afd1eab7c.sql",
    ],
  ])("changes only the digital settlement and receipt notification in %s", (name, path) => {
    expect(compact(newDefinition(name))).toBe(
      compact(previousSettlement(previousFunction(path, name))),
    );
    expect(functionSql(name)).toContain("ON CONFLICT (order_item_id) DO NOTHING");
    expect(functionSql(name)).toContain("assign_unique_files_for_order");
    expect(functionSql(name)).toContain("v_new_order := 'paid'");
    expect(functionSql(name)).toContain("status = 'academic_review'");
    expect(functionSql(name)).toContain("status = 'waiting_assignment'");
  });
  it("refund rejection restores pending digital paid without rewriting legacy/service behavior", () => {
    const refund = functionSql("review_refund");
    expect(refund).toContain("WHERE id = r.order_id FOR UPDATE");
    expect(refund).toContain(
      "WHERE order_id = r.order_id AND status = 'pending') THEN 'paid' ELSE 'completed'",
    );
    expect(refund).toContain(
      "status = v_restore WHERE id = r.order_id AND status = 'refund_requested'",
    );
    expect(refund).toContain("UPDATE public.payments SET status = 'paid'");
    expect(refund).not.toContain("seller_ledger");
    const request = readFileSync(
      "supabase/migrations/20260728131658_d5dbeb52-cab3-4bdf-aa68-212b076abe97.sql",
      "utf8",
    )
      .split("CREATE OR REPLACE FUNCTION public.request_refund")[1]
      .split("CREATE OR REPLACE FUNCTION public.consume_download")[0];
    expect(request).toContain("WHERE id = _order_id FOR UPDATE");
    expect(request).toContain("setting_int('refund_window_days', 7)");
  });
});

describe("buyer receipt UI wiring (static, not GUI integration)", () => {
  it("requires explicit dialog confirmation, refreshes status and handles request failures", () => {
    const ui = readFileSync("src/components/ebry/digital-receipt.tsx", "utf8");
    expect(ui).toContain("AlertDialogDescription");
    expect(ui).toContain("confirmReceipt({ data: { orderId } })");
    expect(ui).toContain("!receipt.can_confirm");
    expect(ui).toContain("finally");
    expect(ui).toContain('role="alert"');
    expect(ui).toContain("Muat ulang status");
    expect(ui).not.toContain("setInterval");
    const detail = readFileSync("src/routes/_authenticated/dashboard.pesanan.$id.tsx", "utf8");
    expect(detail).toContain("<DigitalReceiptPanel orderId={order.id} onConfirmed={refresh}");
    expect(detail).toContain('["digital-receipt", id]');
  });
  it("keeps code access separate from file quota and renders secrets as text", () => {
    const ui = readFileSync("src/components/ebry/stock-code-access.tsx", "utf8");
    expect(ui).toContain("stockCodeUrl(visibleCode)");
    expect(ui).toContain("{visibleCode}</pre>");
    expect(ui).toContain('rel="noopener noreferrer"');
    expect(ui).not.toContain("dangerouslySetInnerHTML");
    const library = readFileSync("src/routes/_authenticated/dashboard.produk-saya.tsx", "utf8");
    expect(library).toContain("const quotaExhausted = !isCode && remaining <= 0");
    expect(library).toContain("<StockCodeAccess entitlementId={e.id} locked={locked}");
    const server = readFileSync("src/lib/orders.functions.ts", "utf8");
    const entitlements = server
      .split("export const listMyEntitlements")[1]
      .split("export const downloadEntitlement")[0];
    expect(entitlements).toContain('.eq("user_id", (context as Ctx).userId)');
  });
});
