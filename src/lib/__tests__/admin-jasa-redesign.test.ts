import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/_authenticated/admin/seller.jasa.tsx", "utf8");

describe("admin jasa redesign (static source contract)", () => {
  it("uses keyboard-enabled tabs and keeps draft reasons across panels", () => {
    expect(page).toContain('from "@/components/ui/tabs"');
    expect(page).toContain('defaultValue={canViewServices ? "moderation" : "complaints"}');
    expect(page.match(/forceMount/g)).toHaveLength(2);
    expect(page.match(/data-\[state=inactive\]:hidden/g)).toHaveLength(2);
    expect(page).toContain('<ForbiddenState permission="services.view" />');
  });

  it("keeps loading, retry, refresh, server totals and version checks", () => {
    for (const token of [
      "CardSkeleton",
      "EmptyState",
      "ErrorState",
      "refetch()",
      "data.total",
      "expectedVersion: listing.version",
    ])
      expect(page).toContain(token);
    expect(page.match(/disabled=\{pending\}/g)).toHaveLength(2);
    expect(page).toContain("isFetching || mutation.isPending");
  });

  it("preserves the complete contract and accessible disclosure", () => {
    expect(page).toContain("<ServiceAgreement listing={listing} />");
    expect(page).toContain("aria-expanded={open}");
    expect(page).toContain("aria-controls={`agreement-${listing.id}`}");
    expect(page).not.toContain("line-clamp-3");
    expect(page).not.toContain("min-h-10");
  });

  it("requires refund confirmation and keeps server permissions", () => {
    expect(page).toContain("<AlertDialogTrigger asChild>");
    expect(page).toContain("Konfirmasi refund penuh");
    expect(page).toContain('onClick={() => onDecide("refund", reason.trim())}');
    for (const permission of ["services.update", "orders.view", "orders.update", "refunds.approve"])
      expect(page).toContain(`useCan("${permission}")`);
  });
});
