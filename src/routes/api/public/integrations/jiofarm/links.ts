import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  product: z.string().trim().min(1).max(120),
  links: z.array(z.string().trim().min(8).max(1000)).min(1).max(100),
  source: z.string().trim().max(40).optional(),
  source_ref: z.string().trim().max(120).optional(),
  expires_at: z.string().datetime().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const MAX_INGEST_BYTES = 128 * 1024;

export const Route = createFileRoute("/api/public/integrations/jiofarm/links")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeIngest, adminClient, resolveCodeProduct } = await import("@/lib/stock-codes.server");
        if (!authorizeIngest(request)) {
          const { recordSecurityEvent } = await import("@/lib/security-event.server");
          await recordSecurityEvent({
            eventType: "invalid_internal_job_token",
            severity: "HIGH",
            category: "security_violation",
            endpoint: "/api/public/integrations/jiofarm/links",
            httpMethod: "POST",
            statusCode: 401,
            reasonCode: "INVALID_INGEST_TOKEN",
            sourceSystem: "internal_job",
            ipAddress: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip"),
            userAgent: request.headers.get("user-agent"),
          });
          return json({ error: "unauthorized" }, 401);
        }

        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_INGEST_BYTES) {
          return json({ error: "payload too large" }, 413);
        }

        let payload: unknown;
        try {
          const raw = await request.text();
          if (Buffer.byteLength(raw, "utf8") > MAX_INGEST_BYTES) {
            return json({ error: "payload too large" }, 413);
          }
          payload = JSON.parse(raw);
        } catch {
          return json({ error: "invalid json" }, 400);
        }

        const parsed = schema.safeParse(payload);
        if (!parsed.success) return json({ error: "invalid payload", detail: parsed.error.issues[0]?.message }, 400);

        const product = await resolveCodeProduct(parsed.data.product);
        if (!product) return json({ error: "product not found or not in code delivery mode" }, 404);

        const sb = await adminClient();
        const { data, error } = await sb.rpc("ingest_stock_codes", {
          _product_id: product.id,
          _codes: parsed.data.links,
          _source: parsed.data.source ?? "jiofarm",
          _expires_at: parsed.data.expires_at ?? undefined,
          _source_ref: parsed.data.source_ref ?? undefined,
        });
        if (error) {
          console.error("[jiofarm] ingest gagal:", error.message);
          return json({ error: "ingest failed" }, 500);
        }
        return json({ ok: true, product: product.name, ...(data as object) });
      },
    },
  },
});
