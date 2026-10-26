import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { marketplaceStageKey } from "@/components/ebry/live-timeline";
import {
  MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES,
  marketplaceServiceDeliverySchema,
} from "../marketplace-service";

const publication = readFileSync(
  "supabase/migrations/20261003150000_marketplace_service_realtime_publication.sql",
  "utf8",
);
const artifact = readFileSync(
  "supabase/migrations/20261003160000_marketplace_service_delivery_artifact.sql",
  "utf8",
);
const timeline = readFileSync("src/components/ebry/live-timeline.tsx", "utf8");
const buyerPage = readFileSync("src/routes/_authenticated/dashboard.pesanan.$id.tsx", "utf8");
const sellerPage = readFileSync("src/routes/_authenticated/seller.jasa-pesanan.tsx", "utf8");
const buyerPanel = readFileSync("src/components/ebry/marketplace-service-order.tsx", "utf8");

describe("marketplace realtime publication (static SQL contract)", () => {
  it("adds all three service tables idempotently", () => {
    for (const table of [
      "marketplace_service_orders",
      "marketplace_service_deliveries",
      "marketplace_service_events",
    ]) {
      expect(publication).toContain(`tablename = '${table}'`);
    }
    expect(publication).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE");
    expect(publication.match(/FROM pg_publication_tables/g)?.length).toBe(3);
  });

  it("reads the listing name from the order snapshot instead of the live listing", () => {
    expect(publication).toContain("COALESCE(snap.name_snapshot, ms.name)");
    expect(publication).toContain("oi.item_type = 'marketplace_service'");
    expect(publication).not.toContain("'service_name', ms.name");
  });

  it("keeps seller RPC execution locked to authenticated only", () => {
    expect(publication).toContain(
      "REVOKE ALL ON FUNCTION public.list_my_service_orders() FROM PUBLIC, anon, authenticated",
    );
    expect(publication).toContain(
      "REVOKE ALL ON FUNCTION public.get_my_service_order(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(publication).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_my_service_orders() TO authenticated",
    );
  });
});

describe("marketplace delivery artifact SQL (static contract)", () => {
  it("provisions a private bounded bucket with the documented mime list", () => {
    expect(artifact).toContain("'service-deliveries', 'service-deliveries', false, 26214400");
    expect(artifact).toContain("'application/pdf'");
    expect(artifact).toContain("'application/zip'");
    expect(artifact).toContain("ON CONFLICT (id) DO NOTHING");
    expect(artifact).toContain("SERVICE_DELIVERY_BUCKET_CONFLICT");
  });

  it("extends delivery columns and enforces one payload per kind", () => {
    for (const column of ["storage_path", "original_name", "mime_type", "file_size"]) {
      expect(artifact).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(artifact).toContain("CHECK (kind IN ('link','note','file'))");
    expect(artifact).toContain("(kind = 'file' AND storage_path IS NOT NULL");
    expect(artifact).toContain("file_size BETWEEN 1 AND 26214400");
  });

  it("binds storage policies to order membership, not the uploader folder", () => {
    expect(artifact).toContain(
      "public.is_service_order_seller(public.try_uuid((storage.foldername(name))[1]))",
    );
    expect(artifact).toContain(
      "public.is_service_order_buyer(public.try_uuid((storage.foldername(name))[1]))",
    );
    expect(artifact).toContain("RETURN _text::uuid;");
    expect(artifact).not.toContain("storage.foldername(name))[1])::uuid");
  });

  it("replaces the five-argument delivery RPC with a guarded file variant", () => {
    expect(artifact).toContain(
      "DROP FUNCTION IF EXISTS public.submit_service_delivery(uuid,text,text,text,text);",
    );
    expect(artifact).toContain("_storage_path text DEFAULT NULL");
    expect(artifact).toContain("_storage_path NOT LIKE _order_id::text || '/%'");
    expect(artifact).toContain("position('..' IN _storage_path) > 0");
    expect(artifact).toContain("FILE_NOT_FOUND");
    expect(artifact).toContain("FILE_METADATA_REQUIRED");
    expect(artifact).toContain(
      "REVOKE ALL ON FUNCTION public.submit_service_delivery(uuid,text,text,text,text,text,text,text,bigint) FROM PUBLIC, anon, authenticated",
    );
  });
});

describe("marketplace timeline (pure mapping)", () => {
  it("maps work_state to the combined payment and work stages", () => {
    expect(marketplaceStageKey("paid", "awaiting_requirements")).toBe("awaiting_requirements");
    expect(marketplaceStageKey("paid", "in_progress")).toBe("in_progress");
    expect(marketplaceStageKey("paid", "delivered")).toBe("delivered");
    expect(marketplaceStageKey("paid", "revision_requested")).toBe("revision_requested");
    expect(marketplaceStageKey("completed", "accepted")).toBe("accepted");
    expect(marketplaceStageKey("paid", "complaint_open")).toBe("complaint_open");
  });

  it("never maps an unpaid order past the payment stages", () => {
    expect(marketplaceStageKey("awaiting_payment", "awaiting_requirements")).toBe(
      "awaiting_payment",
    );
    expect(marketplaceStageKey("payment_under_review", "awaiting_requirements")).toBe(
      "payment_under_review",
    );
  });

  it("renders marketplace_service with its own stages and service events", () => {
    expect(timeline).toContain("const MARKETPLACE_STAGES");
    expect(timeline).toContain("awaiting_requirements");
    expect(timeline).toContain("MARKETPLACE_EVENT_LABEL");
    expect(timeline).toContain("serviceEvents");
    expect(timeline).not.toMatch(
      /order\?\.order_type === "service" \? SERVICE_STAGES : DIGITAL_STAGES/,
    );
  });
});

describe("buyer and seller integration (static source contract)", () => {
  it("subscribes the buyer page to the service tables and forwards events to the timeline", () => {
    expect(buyerPage).toContain('"marketplace_service_orders"');
    expect(buyerPage).toContain('"marketplace_service_deliveries"');
    expect(buyerPage).toContain('"marketplace_service_events"');
    expect(buyerPage).toContain('["service-order", id]');
    expect(buyerPage).toContain("serviceEvents={serviceOrder?.events ?? []}");
    expect(buyerPage).toContain("serviceWorkState={serviceOrder?.contract?.work_state ?? null}");
  });

  it("offers a signed download for file deliveries and never exposes the path", () => {
    expect(buyerPanel).toContain("getServiceDeliveryFileUrl");
    expect(buyerPanel).toContain("Unduh berkas hasil");
    expect(buyerPanel).toContain('delivery.kind === "file"');
  });

  it("lets the seller upload an artifact through a signed URL and refreshes the list", () => {
    const card = readFileSync("src/components/seller/service-order-card.tsx", "utf8");
    expect(card).toContain("prepareServiceDeliveryUpload");
    expect(card).toContain("uploadToSignedUrl");
    expect(card).toContain("Berkas hasil (maksimal 25 MB)");
    expect(sellerPage).toContain('"my-service-orders"');
    expect(sellerPage).toContain('"marketplace_service_events"');
  });
});

describe("delivery input schema", () => {
  const base = {
    orderId: "00000000-0000-4000-8000-000000000001",
    kind: "file" as const,
    summary: "Hasil pekerjaan versi final",
  };
  it("requires full metadata for a file delivery", () => {
    expect(marketplaceServiceDeliverySchema.safeParse(base).success).toBe(false);
    expect(
      marketplaceServiceDeliverySchema.safeParse({
        ...base,
        storagePath: `${base.orderId}/abc.pdf`,
        originalName: "hasil.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      }).success,
    ).toBe(true);
  });
  it("rejects traversal paths, oversized files and unknown mime types", () => {
    const valid = {
      ...base,
      storagePath: `${base.orderId}/abc.pdf`,
      originalName: "hasil.pdf",
      mimeType: "application/pdf" as const,
      fileSize: 1024,
    };
    expect(
      marketplaceServiceDeliverySchema.safeParse({
        ...valid,
        storagePath: `${base.orderId}/../secret.pdf`,
      }).success,
    ).toBe(false);
    expect(
      marketplaceServiceDeliverySchema.safeParse({
        ...valid,
        fileSize: MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      marketplaceServiceDeliverySchema.safeParse({ ...valid, mimeType: "application/x-msdownload" })
        .success,
    ).toBe(false);
  });
  it("still accepts the original link and note deliveries", () => {
    expect(
      marketplaceServiceDeliverySchema.safeParse({
        orderId: base.orderId,
        kind: "link",
        url: "https://example.com/hasil",
        summary: base.summary,
      }).success,
    ).toBe(true);
    expect(
      marketplaceServiceDeliverySchema.safeParse({
        orderId: base.orderId,
        kind: "note",
        note: "Catatan hasil",
        summary: base.summary,
      }).success,
    ).toBe(true);
  });
});
