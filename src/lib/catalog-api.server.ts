import { z } from "zod";
import {
  readCatalogCategories,
  readCatalogProduct,
  readCatalogProducts,
} from "./public-catalog.server";

const querySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    store: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(0).max(500).default(0),
    pageSize: z.coerce.number().int().min(1).max(48).default(24),
  })
  .strict();

const readers = {
  categories: readCatalogCategories,
  products: readCatalogProducts,
  product: readCatalogProduct,
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** HTTP boundary only: business queries remain shared with the website. */
export async function handleCatalogRequest(request: Request, source = readers): Promise<Response> {
  if (request.method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  try {
    if (path === "/api/v1/catalog/categories") {
      if (url.search) return json({ error: { code: "INVALID_QUERY" } }, 400);
      const result = await source.categories({ kind: "product" });
      return result.error
        ? json({ error: { code: "CATALOG_UNAVAILABLE" } }, 503)
        : json({ data: { items: result.items } });
    }
    if (path === "/api/v1/catalog/products") {
      const entries = [...url.searchParams];
      if (new Set(entries.map(([key]) => key)).size !== entries.length)
        return json({ error: { code: "INVALID_QUERY" } }, 400);
      const parsed = querySchema.safeParse(Object.fromEntries(entries));
      if (!parsed.success) return json({ error: { code: "INVALID_QUERY" } }, 400);
      const result = await source.products(parsed.data);
      if (result.error) return json({ error: { code: "CATALOG_UNAVAILABLE" } }, 503);
      // Existing `total` is page length, not a full-catalog count.
      return json({
        data: {
          items: result.items,
          page: result.page,
          pageSize: parsed.data.pageSize,
          nextPage: result.nextPage,
        },
      });
    }
    const match = /^\/api\/v1\/catalog\/products\/([^/]+)$/.exec(path);
    if (match) {
      const slug = z.string().trim().min(1).max(120).safeParse(decodeURIComponent(match[1]));
      if (
        !slug.success ||
        ["/", "\\", String.fromCharCode(0)].some((value) => slug.data.includes(value)) ||
        url.search
      )
        return json({ error: { code: "INVALID_QUERY" } }, 400);
      const result = await source.product({ slug: slug.data });
      if (result.error) return json({ error: { code: "CATALOG_UNAVAILABLE" } }, 503);
      return result.product
        ? json({ data: { product: result.product } })
        : json({ error: { code: "PRODUCT_NOT_FOUND" } }, 404);
    }
    return json({ error: { code: "NOT_FOUND" } }, 404);
  } catch (error) {
    if (error instanceof URIError) return json({ error: { code: "INVALID_QUERY" } }, 400);
    return json({ error: { code: "CATALOG_UNAVAILABLE" } }, 503);
  }
}
