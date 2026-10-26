import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");

type Ctx = { supabase: any; userId: string };

async function guard<T>(
  context: Ctx,
  permission: string,
  run: (helpers: Awaited<ReturnType<typeof authz>>) => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run(helpers);
}

const PUBLIC_COLUMNS =
  "id, title, slug, excerpt, cover_url, tags, reading_minutes, author_name, published_at, view_count";

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Publik                                                              */
/* ------------------------------------------------------------------ */

export const listArticles = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        q: z.string().trim().max(80).optional(),
        tag: z.string().trim().max(40).optional(),
        page: z.number().int().min(0).max(200).optional(),
        pageSize: z.number().int().min(1).max(24).optional(),
      })
      .optional()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const pageSize = data?.pageSize ?? 9;
    const page = data?.page ?? 0;

    let query = supabase
      .from("articles")
      .select(PUBLIC_COLUMNS, { count: "exact" })
      .eq("status", "published")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    const term = data?.q ? escapeLike(data.q) : "";
    if (term) query = query.or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`);
    if (data?.tag) query = query.contains("tags", [data.tag]);

    const { data: rows, error, count } = await query;
    if (error) {
      console.error("[articles] listArticles gagal:", error.message);
      return { items: [], error: "Artikel sedang tidak dapat dimuat." as const, total: 0, page, nextPage: null };
    }
    const items = rows ?? [];
    const total = count ?? items.length;
    return {
      items,
      error: null,
      total,
      page,
      nextPage: items.length === pageSize && (page + 1) * pageSize < total ? page + 1 : null,
    };
  });

export const getArticleBySlug = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: z.string().trim().min(1).max(140) }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { data: article, error } = await supabase
      .from("articles")
      .select(`${PUBLIC_COLUMNS}, content`)
      .eq("slug", data.slug)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[articles] getArticleBySlug gagal:", error.message);
      return { article: null, related: [] as any[], error: "Artikel tidak dapat dimuat." as const };
    }
    if (!article) return { article: null, related: [] as any[], error: null };

    const { data: related } = await supabase
      .from("articles")
      .select(PUBLIC_COLUMNS)
      .eq("status", "published")
      .is("deleted_at", null)
      .neq("id", (article as any).id)
      .order("published_at", { ascending: false })
      .limit(3);

    return { article, related: related ?? [], error: null };
  });

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const listAdminArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        search: z.string().trim().max(80).default(""),
        status: z.enum(["all", "draft", "published", "archived"]).default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(10),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "articles.view", async () => {
      let query = context.supabase
        .from("articles")
        .select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range((data.page - 1) * data.pageSize, data.page * data.pageSize - 1);

      if (data.search) query = query.ilike("title", `%${data.search.replace(/[%_]/g, " ")}%`);
      if (data.status !== "all") query = query.eq("status", data.status);

      const { data: rows, error, count } = await query;
      if (error) return { forbidden: false as const, items: [], total: 0, message: error.message };
      return { forbidden: false as const, items: rows ?? [], total: count ?? 0, message: null };
    }),
  );

const articleInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(4).max(140),
  slug: z.string().trim().max(140).optional(),
  excerpt: z.string().trim().max(300).optional(),
  content: z.string().trim().min(20),
  coverUrl: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
  status: z.enum(["draft", "published", "archived"]),
});

function readingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export const saveArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => articleInput.parse(d))
  .handler(async ({ context, data }) => {
    const permission = data.id ? "articles.update" : "articles.create";
    return guard(context as Ctx, permission, async (helpers) => {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();

      const payload: any = {
        title: data.title,
        slug: helpers.slugify(data.slug?.trim() || data.title),
        excerpt: data.excerpt || null,
        content: data.content,
        cover_url: data.coverUrl || null,
        tags: data.tags,
        status: data.status,
        reading_minutes: readingMinutes(data.content),
        author_id: context.userId,
        author_name: profile?.full_name || "Tim Ebrystore",
        published_at: data.status === "published" ? new Date().toISOString() : null,
      };

      if (data.id) {
        const { data: before } = await context.supabase
          .from("articles")
          .select("*")
          .eq("id", data.id)
          .maybeSingle();
        if (before?.published_at && data.status === "published") payload.published_at = before.published_at;

        const { data: after, error } = await context.supabase
          .from("articles")
          .update(payload)
          .eq("id", data.id)
          .select()
          .maybeSingle();
        if (error) return { forbidden: false as const, ok: false, message: error.message };
        await helpers.writeAudit(context as Ctx, {
          action: "article.update",
          entityType: "articles",
          entityId: data.id,
          before,
          after,
        });
        return { forbidden: false as const, ok: true, message: "Artikel diperbarui." };
      }

      const { data: after, error } = await context.supabase
        .from("articles")
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) {
        const message = error.code === "23505" ? "Slug artikel sudah dipakai, ubah judul atau slug." : error.message;
        return { forbidden: false as const, ok: false, message };
      }
      await helpers.writeAudit(context as Ctx, {
        action: "article.create",
        entityType: "articles",
        entityId: after?.id,
        after,
      });
      return { forbidden: false as const, ok: true, message: "Artikel dibuat." };
    });
  });

export const setArticleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) }).parse(d),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "articles.update", async (helpers) => {
      const { data: before } = await context.supabase.from("articles").select("*").eq("id", data.id).maybeSingle();
      const patch: any = { status: data.status };
      if (data.status === "published" && !before?.published_at) patch.published_at = new Date().toISOString();

      const { error } = await context.supabase.from("articles").update(patch).eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "article.status",
        entityType: "articles",
        entityId: data.id,
        before,
        after: patch,
      });
      return { forbidden: false as const, ok: true, message: "Status artikel diperbarui." };
    }),
  );

export const deleteArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "articles.delete", async (helpers) => {
      const { data: before } = await context.supabase.from("articles").select("*").eq("id", data.id).maybeSingle();
      const { error } = await context.supabase
        .from("articles")
        .update({ deleted_at: new Date().toISOString(), status: "archived" })
        .eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "article.delete",
        entityType: "articles",
        entityId: data.id,
        before,
      });
      return { forbidden: false as const, ok: true, message: "Artikel dihapus." };
    }),
  );