import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function readingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default defineTool({
  name: "manage_article",
  title: "Kelola artikel",
  description:
    "Membuat, mengubah, menerbitkan, mengarsipkan, atau menghapus artikel blog/panduan (judul, isi, tag, cover, status).",
  inputSchema: {
    action: z.enum(["create", "update", "publish", "archive", "soft_delete"]).describe("Aksi yang dilakukan."),
    id: z.string().uuid().optional().describe("ID artikel (wajib selain action create)."),
    title: z.string().trim().min(4).max(140).optional().describe("Judul artikel."),
    content: z.string().trim().min(20).max(50000).optional().describe("Isi artikel (markdown)."),
    slug: z.string().trim().max(140).optional().describe("Slug URL; otomatis dari judul bila kosong."),
    excerpt: z.string().trim().max(300).optional().describe("Ringkasan singkat."),
    cover_url: z.string().url().max(500).optional().describe("URL gambar sampul."),
    tags: z.array(z.string().trim().min(1).max(24)).max(6).optional().describe("Maksimal 6 tag."),
    status: z.enum(["draft", "published", "archived"]).optional().describe("Status publikasi saat create/update."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    if (input.action === "create") {
      if (!input.title || !input.content) return errorResult("Judul dan isi artikel wajib diisi.");
      const slug = slugify(input.slug || input.title);
      if (!slug) return errorResult("Slug tidak valid.");
      const { data: dup } = await supabase.from("articles").select("id").eq("slug", slug).maybeSingle();
      if (dup) return errorResult(`Slug "${slug}" sudah dipakai artikel lain.`);
      const status = input.status ?? "draft";
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.getUserId() ?? "")
        .maybeSingle();
      const { data, error } = await supabase
        .from("articles")
        .insert({
          title: input.title,
          slug,
          content: input.content,
          status,
          tags: input.tags ?? [],
          reading_minutes: readingMinutes(input.content),
          author_id: ctx.getUserId() ?? null,
          author_name: (profile as { full_name?: string } | null)?.full_name ?? null,
          published_at: status === "published" ? new Date().toISOString() : null,
          ...(input.excerpt ? { excerpt: input.excerpt } : {}),
          ...(input.cover_url ? { cover_url: input.cover_url } : {}),
        })
        .select("id, title, slug, status, tags, published_at")
        .maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Artikel gagal dibuat atau akun tidak punya izin.");
      await supabase.rpc("write_audit_log", {
        _action: "article.create",
        _entity_type: "articles",
        _entity_id: data.id,
        _before: null,
        _after: data,
        _reason: "mcp manage_article",
        _ip: null,
        _trace_id: null,
      });
      return jsonResult({ created: data });
    }

    if (!input.id) return errorResult("ID artikel wajib diisi.");
    const { data: before } = await supabase.from("articles").select("*").eq("id", input.id).maybeSingle();
    if (!before) return errorResult("Artikel tidak ditemukan.");

    const patch: Record<string, unknown> = {};
    if (input.action === "publish") {
      patch['status'] = "published";
      patch['published_at'] = (before as { published_at?: string }).published_at ?? new Date().toISOString();
    } else if (input.action === "archive") {
      patch['status'] = "archived";
    } else if (input.action === "soft_delete") {
      patch['deleted_at'] = new Date().toISOString();
      patch['status'] = "archived";
    } else {
      if (input.title) patch['title'] = input.title;
      if (input.slug) patch['slug'] = slugify(input.slug);
      if (input.excerpt !== undefined) patch['excerpt'] = input.excerpt;
      if (input.cover_url !== undefined) patch['cover_url'] = input.cover_url;
      if (input.tags) patch['tags'] = input.tags;
      if (input.content) {
        patch['content'] = input.content;
        patch['reading_minutes'] = readingMinutes(input.content);
      }
      if (input.status) {
        patch['status'] = input.status;
        if (input.status === "published" && !(before as { published_at?: string }).published_at) {
          patch['published_at'] = new Date().toISOString();
        }
      }
      if (!Object.keys(patch).length) return errorResult("Tidak ada perubahan yang dikirim.");
    }

    const { data, error } = await supabase
      .from("articles")
      .update(patch)
      .eq("id", input.id)
      .select("id, title, slug, status, tags, published_at, deleted_at")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Perubahan ditolak — akun tidak punya izin mengelola artikel.");
    await supabase.rpc("write_audit_log", {
      _action: `article.${input.action}`,
      _entity_type: "articles",
      _entity_id: input.id,
      _before: before,
      _after: data,
      _reason: "mcp manage_article",
      _ip: null,
      _trace_id: null,
    });
    return jsonResult({ updated: data });
  },
});
