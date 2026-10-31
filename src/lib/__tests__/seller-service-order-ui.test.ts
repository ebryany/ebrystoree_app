import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { MarketplaceServiceOrderRow } from "../marketplace-service";
import {
  SERVICE_ORDER_TABS,
  countServiceComplaints,
  countServiceOrders,
  filterServiceOrders,
  isServiceOrderActionable,
  serviceOrderDeadline,
  serviceOrderNextAction,
  serviceOrderWorkStateHint,
} from "../seller-service-order-ui";

const card = readFileSync("src/components/seller/service-order-card.tsx", "utf8");
const page = readFileSync("src/routes/_authenticated/seller.jasa-pesanan.tsx", "utf8");

function row(overrides: Partial<MarketplaceServiceOrderRow> = {}): MarketplaceServiceOrderRow {
  return {
    order_id: "00000000-0000-4000-8000-000000000001",
    order_number: "EBS-20261003-000020",
    order_status: "paid",
    total: 20000,
    paid_at: "2026-10-03T12:00:00.000Z",
    work_state: "awaiting_requirements",
    complaint_open: false,
    due_at: null,
    revision_used: 0,
    revision_limit: 1,
    requirements_approved_at: null,
    accepted_at: null,
    service_name: "JASA BUAT WEB",
    seller_response_due_at: null,
    review_due_at: null,
    extension_requested_days: null,
    ...overrides,
  };
}

describe("service order next action", () => {
  it("tells the seller to approve requirements first", () => {
    const next = serviceOrderNextAction(row());
    expect(next.tone).toBe("action");
    expect(next.title).toContain("Setujui atau tolak kebutuhan");
  });

  it("asks for delivery while work is in progress and on revision", () => {
    expect(serviceOrderNextAction(row({ work_state: "in_progress" })).title).toContain(
      "kirim hasil",
    );
    expect(serviceOrderNextAction(row({ work_state: "revision_requested" })).title).toContain(
      "revisi",
    );
  });

  it("waits on the buyer after delivery and reports completion", () => {
    expect(serviceOrderNextAction(row({ work_state: "delivered" })).tone).toBe("waiting");
    expect(serviceOrderNextAction(row({ work_state: "accepted" })).tone).toBe("done");
  });

  it("never asks for work before payment or while a complaint is open", () => {
    expect(serviceOrderNextAction(row({ order_status: "awaiting_payment" })).tone).toBe("waiting");
    expect(serviceOrderNextAction(row({ order_status: "payment_under_review" })).tone).toBe(
      "waiting",
    );
    const complaint = serviceOrderNextAction(
      row({ complaint_open: true, work_state: "in_progress" }),
    );
    expect(complaint.tone).toBe("danger");
    expect(complaint.title).toContain("Komplain");
  });

  it("marks cancelled and refunded orders as finished", () => {
    expect(serviceOrderNextAction(row({ order_status: "cancelled" })).tone).toBe("danger");
    expect(serviceOrderNextAction(row({ order_status: "refunded" })).tone).toBe("danger");
  });
});

describe("service order deadline urgency", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");
  it("returns null without a due date", () => {
    expect(serviceOrderDeadline(null, now)).toBeNull();
  });
  it("flags an overdue deadline", () => {
    const result = serviceOrderDeadline("2026-10-03T11:00:00.000Z", now);
    expect(result?.tone).toBe("overdue");
    expect(result?.label).toContain("Tenggat lewat");
  });
  it("flags a deadline under 24 hours with hours remaining", () => {
    const result = serviceOrderDeadline("2026-10-03T20:00:00.000Z", now);
    expect(result?.tone).toBe("soon");
    expect(result?.label).toBe("Tenggat 8 jam lagi");
  });
  it("shows the date for a normal deadline", () => {
    const result = serviceOrderDeadline("2026-10-06T12:00:00.000Z", now);
    expect(result?.tone).toBe("normal");
    expect(result?.label).toContain("Tenggat");
  });
});

describe("service order filtering and counts", () => {
  const items = [
    row({ order_id: "a", work_state: "awaiting_requirements" }),
    row({ order_id: "b", work_state: "in_progress" }),
    row({ order_id: "c", work_state: "revision_requested" }),
    row({ order_id: "d", work_state: "delivered" }),
    row({ order_id: "e", work_state: "accepted", order_status: "completed" }),
    row({ order_id: "f", work_state: "in_progress", complaint_open: true }),
    row({ order_id: "g", work_state: "awaiting_requirements", order_status: "awaiting_payment" }),
  ];

  it("treats only paid, unblocked, actionable states as needing action", () => {
    expect(isServiceOrderActionable(items[0])).toBe(true);
    expect(isServiceOrderActionable(items[5])).toBe(false);
    expect(isServiceOrderActionable(items[6])).toBe(false);
    expect(filterServiceOrders(items, "needs_action").map((r) => r.order_id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("separates in progress, revision, and awaiting buyer", () => {
    expect(filterServiceOrders(items, "in_progress").map((r) => r.order_id)).toEqual(["b"]);
    expect(filterServiceOrders(items, "revision").map((r) => r.order_id)).toEqual(["c"]);
    expect(filterServiceOrders(items, "awaiting_buyer").map((r) => r.order_id)).toEqual(["d"]);
  });

  it("counts every tab and complaints from the same data", () => {
    const counts = countServiceOrders(items);
    expect(counts.needs_action).toBe(3);
    expect(counts.in_progress).toBe(1);
    expect(counts.revision).toBe(1);
    expect(counts.awaiting_buyer).toBe(1);
    expect(counts.all).toBe(7);
    expect(countServiceComplaints(items)).toBe(1);
  });
});

describe("work state hints", () => {
  it("explains every state in seller language", () => {
    for (const hint of Object.values(serviceOrderWorkStateHint)) {
      expect(hint.length).toBeGreaterThan(20);
      expect(hint).not.toMatch(/undefined|null/);
    }
    expect(serviceOrderWorkStateHint.awaiting_requirements).toContain("setujui");
    expect(serviceOrderWorkStateHint.revision_requested).toContain("revisi");
  });
});

describe("seller page redesign (static source contract)", () => {
  it("renders the work summary, complaints banner, and tab set from the shared lib", () => {
    expect(page).toContain("Ringkasan pesanan jasa");
    expect(page).toContain("Menunggu pembeli");
    expect(page).toContain("Revisi diminta");
    expect(page).toContain("complaints > 0");
    expect(page).toContain("SERVICE_ORDER_TABS");
    expect(page).toContain('"marketplace_service_events"');
  });

  it("keeps the card hierarchy: header, next action, metadata, detail", () => {
    expect(card).toContain("serviceOrderNextAction(row)");
    expect(card).toContain("serviceOrderDeadline(row.due_at, Date.now())");
    expect(card).toContain("serviceOrderWorkStateHint[row.work_state]");
    expect(card).toContain("aria-label={`Pesanan ${row.order_number}`}");
    expect(card).toContain("aria-expanded={isExpanded}");
  });

  it("keeps the layered detail order and the folded agreement", () => {
    const detail = card.slice(card.indexOf("function SellerServiceOrderDetail"));
    const actionIndex = detail.indexOf("Setujui atau tolak kebutuhan");
    const needsIndex = detail.indexOf("Kebutuhan pembeli");
    const agreementIndex = detail.indexOf("<details");
    const historyIndex = detail.indexOf("Hasil terkirim");
    expect(actionIndex).toBeGreaterThan(-1);
    expect(actionIndex).toBeLessThan(needsIndex);
    expect(needsIndex).toBeLessThan(agreementIndex);
    expect(agreementIndex).toBeLessThan(historyIndex);
  });

  it("keeps delivery kinds as a segmented control with one primary button", () => {
    expect(card).toContain("DELIVERY_KINDS");
    expect(card).toContain('className="sr-only"');
    expect(card).toContain("Kirim hasil");
    expect(card.match(/type="submit"/g)?.length).toBe(1);
  });

  it("preserves accessibility and reduced motion", () => {
    expect(page).toContain('role="tablist"');
    expect(page).toContain("aria-selected={active}");
    expect(page).toContain("useReducedMotion");
    expect(card).toContain("focus-visible:outline");
    expect(card).toContain("motion-reduce:animate-none");
  });

  it("does not touch payment RPCs or add new dependencies", () => {
    expect(card).not.toContain("credit_seller_earnings");
    expect(card).not.toContain("accept_service_delivery");
    const imports = [...card.matchAll(/from "([^"]+)"/g)].map(([, spec]) => spec);
    for (const spec of imports) {
      expect(
        spec.startsWith("@/") ||
          spec.startsWith("@tanstack/") ||
          spec === "react" ||
          spec === "motion/react" ||
          spec === "lucide-react",
      ).toBe(true);
    }
  });
});
