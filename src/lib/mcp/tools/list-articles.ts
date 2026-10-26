import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_articles",
  title: "Daftar artikel",
  description: "Menampilkan artikel blog/panduan beserta status, tag, jumlah dibaca, dan waktu terbit.",
  inputSchema: {
    search: z.string().trim().max(120).optional().describe("Cari judul artikel."),
    status: z.enum(["all", "draft", "published", "archived"]).optional().describe("Filter status."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("articles")
      .select("id, title, slug, status, tags, excerpt, reading_minutes, author_name, published_at, view_count, updated_at")
      .is("deleted_at", null);
    if (search) query = query.ilike("title", `%${search}%`);
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});
