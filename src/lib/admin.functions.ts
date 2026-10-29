import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_TONE_KEYS,
  type CategoryIconKey,
  type CategoryTone,
} from "@/lib/category-icons";

const authz = () => import("./authz.server");

type Ctx = { supabase: any; userId: string };

/** Wrapper: jalankan handler dengan permission check, kembalikan payload forbidden bila ditolak. */
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

/* ------------------------------------------------------------------ */
/* Akses & identitas                                                    */
/* ------------------------------------------------------------------ */

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const helpers = await authz();
    try {
      await context.supabase.rpc("sync_my_profile_email");
    } catch {
      /* fallback sync tidak boleh memblokir */
    }
    const access = await helpers.loadAccess(context as Ctx);
    return access;
  });

/** @deprecated dipertahankan untuk kompatibilitas komponen lama */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const helpers = await authz();
    const access = await helpers.loadAccess(context as Ctx);
    return { roles: access.roles, isAdmin: access.isAdmin };
  });

/* ------------------------------------------------------------------ */
/* Ringkasan                                                            */
/* ------------------------------------------------------------------ */

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "admin.dashboard.view", async (helpers) => {
      const sb = (context as Ctx).supabase;
      const access = await helpers.loadAccess(context as Ctx);
      const can = (permission: string) =>
        access.isSuperAdmin || access.permissions.includes(permission);
      const queueDefinitions = [
        {
          label: "Pembayaran perlu verifikasi",
          to: "/admin/payments",
          permission: "payments.view",
          table: "payments",
          column: "status",
          status: "waiting_verification",
        },
        {
          label: "Pengajuan toko",
          to: "/admin/seller",
          permission: "sellers.view",
          table: "stores",
          column: "status",
          status: "pending",
        },
        {
          label: "Produk perlu moderasi",
          to: "/admin/seller/produk",
          permission: "products.view",
          table: "digital_products",
          column: "moderation_status",
          status: "pending",
        },
        {
          label: "Refund perlu ditinjau",
          to: "/admin/refunds",
          permission: "refunds.view",
          table: "refunds",
          column: "status",
          status: "requested",
        },
      ];
      const queues = await Promise.all(
        queueDefinitions
          .filter((queue) => can(queue.permission))
          .map(async (queue) => {
            let query = sb.from(queue.table).select("id", { count: "exact", head: true });
            query =
              queue.table === "refunds"
                ? query.in(queue.column, ["requested", "under_review", "information_requested"])
                : query.eq(queue.column, queue.status);
            if (queue.table === "digital_products") query = query.is("deleted_at", null);
            const result = await query;
            return {
              label: queue.label,
              to: queue.to,
              count: result.error ? null : result.count,
              error: result.error ? "Jumlah belum dapat dimuat." : null,
            };
          }),
      );
      const [
        products,
        published,
        services,
        publishedServices,
        categories,
        roleAssignments,
        users,
        audits,
      ] = await Promise.all([
        sb
          .from("digital_products")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null),
        sb
          .from("digital_products")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .is("deleted_at", null),
        sb.from("services").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .is("deleted_at", null),
        sb.from("categories").select("id", { count: "exact", head: true }).is("deleted_at", null),
        sb.from("user_roles").select("id", { count: "exact", head: true }),
        sb.from("profiles").select("id", { count: "exact", head: true }),
        sb
          .from("audit_logs")
          .select("id, action, entity_type, created_at, actor_role")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const countValue = (result: { count: number | null; error: unknown }) =>
        result.error ? null : result.count;
      return {
        forbidden: false as const,
        queues,
        auditError: audits.error ? "Aktivitas belum dapat dimuat." : null,
        counts: {
          products: countValue(products),
          publishedProducts: countValue(published),
          services: countValue(services),
          publishedServices: countValue(publishedServices),
          categories: countValue(categories),
          roleAssignments: countValue(roleAssignments),
          users: countValue(users),
        },
        recentAudits: audits.data ?? [],
      };
    }),
  );

/* ------------------------------------------------------------------ */
/* Kategori                                                             */
/* ------------------------------------------------------------------ */

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "products.view", async () => {
      const { data } = await context.supabase
        .from("categories")
        .select("id, name, slug, kind, is_active, icon, tone")
        .is("deleted_at", null)
        .order("sort_order");
      return { forbidden: false as const, items: data ?? [] };
    }),
  );

const categoryInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["product", "service"]),
  isActive: z.boolean().default(true),
  icon: z
    .enum(CATEGORY_ICON_KEYS as [CategoryIconKey, ...CategoryIconKey[]])
    .nullable()
    .optional(),
  tone: z
    .enum(CATEGORY_TONE_KEYS as [CategoryTone, ...CategoryTone[]])
    .nullable()
    .optional(),
});

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => categoryInput.parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "categories.manage", async (helpers) => {
      const payload = {
        name: data.name,
        slug: helpers.slugify(data.name),
        kind: data.kind,
        is_active: data.isActive,
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.tone !== undefined ? { tone: data.tone } : {}),
      };

      if (data.id) {
        const { data: before } = await context.supabase
          .from("categories")
          .select("*")
          .eq("id", data.id)
          .maybeSingle();
        const { data: after, error } = await context.supabase
          .from("categories")
          .update(payload)
          .eq("id", data.id)
          .select()
          .maybeSingle();
        if (error) return { forbidden: false as const, ok: false, message: error.message };
        await helpers.writeAudit(context as Ctx, {
          action: "category.update",
          entityType: "categories",
          entityId: data.id,
          before,
          after,
        });
        return { forbidden: false as const, ok: true, message: "Kategori diperbarui." };
      }

      const { data: after, error } = await context.supabase
        .from("categories")
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "category.create",
        entityType: "categories",
        entityId: after?.id,
        after,
      });
      return { forbidden: false as const, ok: true, message: "Kategori dibuat." };
    }),
  );

/* ------------------------------------------------------------------ */
/* Produk digital                                                       */
/* ------------------------------------------------------------------ */

const listQuery = z.object({
  search: z.string().trim().max(120).optional().default(""),
  status: z.enum(["all", "draft", "published", "archived"]).optional().default("all"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(5).max(50).optional().default(10),
});

export const listAdminProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listQuery.parse(d ?? {}))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "products.view", async () => {
      const from = (data.page - 1) * data.pageSize;
      let q = context.supabase
        .from("digital_products")
        .select(
          "id, name, slug, status, price, discount_price, sold_count, updated_at, category_id, short_description, thumbnail_url, download_limit, validity_days",
          {
            count: "exact",
          },
        )
        .is("deleted_at", null)
        // Halaman ini khusus Produk Platform Store; produk seller dikelola lewat
        // moderasi (admin/seller.produk.tsx), bukan form umum ini.
        .is("store_id", null);

      if (data.search) q = q.ilike("name", `%${data.search}%`);
      if (data.status !== "all") q = q.eq("status", data.status);

      const {
        data: items,
        count,
        error,
      } = await q.order("updated_at", { ascending: false }).range(from, from + data.pageSize - 1);

      if (error)
        return {
          forbidden: false as const,
          items: [],
          total: 0,
          error: "Data produk tidak dapat dimuat.",
        };
      return { forbidden: false as const, items: items ?? [], total: count ?? 0, error: null };
    }),
  );

const thumbnailInput = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//.test(v) || v.startsWith("/api/public/catalog-image/"), {
    message: "Gambar tidak valid",
  });

const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
  categoryId: z.string().uuid().nullable().optional(),
  shortDescription: z.string().trim().max(240).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  thumbnailUrl: thumbnailInput.optional(),
  price: z.number().int().min(0).max(1_000_000_000),
  discountPrice: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  downloadLimit: z.number().int().min(1).max(100).default(5),
  validityDays: z.number().int().min(1).max(3650).default(365),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => productInput.parse(d))
  .handler(async ({ context, data }) => {
    const permission = data.id ? "products.update" : "products.create";
    return guard(context as Ctx, permission, async (helpers) => {
      if (data.discountPrice != null && data.discountPrice >= data.price) {
        return {
          forbidden: false as const,
          ok: false,
          message: "Harga diskon harus lebih kecil dari harga normal.",
        };
      }

      const payload = {
        name: data.name,
        slug: helpers.slugify(data.name),
        category_id: data.categoryId ?? null,
        short_description: data.shortDescription || null,
        description: data.description || null,
        thumbnail_url: data.thumbnailUrl || null,
        price: data.price,
        discount_price: data.discountPrice ?? null,
        download_limit: data.downloadLimit,
        validity_days: data.validityDays,
        status: data.status,
      };

      if (data.id) {
        const { data: before } = await context.supabase
          .from("digital_products")
          .select("*")
          .eq("id", data.id)
          .maybeSingle();
        if (before?.store_id != null) {
          return {
            forbidden: false as const,
            ok: false,
            message: "Produk seller dikelola lewat Moderasi Produk, bukan form ini.",
          };
        }
        const { data: after, error } = await context.supabase
          .from("digital_products")
          .update(payload)
          .eq("id", data.id)
          .select()
          .maybeSingle();
        if (error) return { forbidden: false as const, ok: false, message: error.message };
        await helpers.writeAudit(context as Ctx, {
          action: "product.update",
          entityType: "digital_products",
          entityId: data.id,
          before,
          after,
        });
        return { forbidden: false as const, ok: true, message: "Produk diperbarui." };
      }

      const { data: after, error } = await context.supabase
        .from("digital_products")
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "product.create",
        entityType: "digital_products",
        entityId: after?.id,
        after,
      });
      return { forbidden: false as const, ok: true, message: "Produk dibuat." };
    });
  });

export const setProductStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "products.update", async (helpers) => {
      const { data: before } = await context.supabase
        .from("digital_products")
        .select("id, status")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await context.supabase
        .from("digital_products")
        .update({ status: data.status })
        .eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: data.status === "published" ? "product.publish" : "product.unpublish",
        entityType: "digital_products",
        entityId: data.id,
        before,
        after: { status: data.status },
      });
      return { forbidden: false as const, ok: true, message: `Status produk: ${data.status}.` };
    }),
  );

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "products.delete", async (helpers) => {
      const { data: before } = await context.supabase
        .from("digital_products")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (before?.store_id != null) {
        return {
          forbidden: false as const,
          ok: false,
          message: "Produk seller diarsipkan lewat Moderasi Produk, bukan form ini.",
        };
      }
      const { error } = await context.supabase
        .from("digital_products")
        .update({ deleted_at: new Date().toISOString(), status: "archived" })
        .eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "product.delete",
        entityType: "digital_products",
        entityId: data.id,
        before,
        after: { deleted_at: new Date().toISOString() },
        reason: "Soft delete dari dashboard admin",
      });
      return { forbidden: false as const, ok: true, message: "Produk dihapus (soft delete)." };
    }),
  );

/* ------------------------------------------------------------------ */
/* Layanan akademik                                                     */
/* ------------------------------------------------------------------ */

export const listAdminServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => listQuery.parse(d ?? {}))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "services.view", async () => {
      const from = (data.page - 1) * data.pageSize;
      let q = context.supabase
        .from("services")
        .select(
          "id, name, slug, status, order_capacity, updated_at, category_id, short_description, description, thumbnail_url, requirements_note, service_packages(id, name, price, estimated_days, is_active)",
          { count: "exact" },
        )
        .is("deleted_at", null);

      if (data.search) q = q.ilike("name", `%${data.search}%`);
      if (data.status !== "all") q = q.eq("status", data.status);

      const {
        data: items,
        count,
        error,
      } = await q.order("updated_at", { ascending: false }).range(from, from + data.pageSize - 1);

      if (error)
        return {
          forbidden: false as const,
          items: [],
          total: 0,
          error: "Data layanan tidak dapat dimuat.",
        };
      return { forbidden: false as const, items: items ?? [], total: count ?? 0, error: null };
    }),
  );

const serviceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
  categoryId: z.string().uuid().nullable().optional(),
  shortDescription: z.string().trim().max(240).optional().default(""),
  description: z.string().trim().max(5000).optional().default(""),
  thumbnailUrl: thumbnailInput.optional(),
  requirementsNote: z.string().trim().max(2000).optional().default(""),
  orderCapacity: z.number().int().min(0).max(10000).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export const saveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => serviceInput.parse(d))
  .handler(async ({ context, data }) => {
    const permission = data.id ? "services.update" : "services.create";
    return guard(context as Ctx, permission, async (helpers) => {
      const payload = {
        name: data.name,
        slug: helpers.slugify(data.name),
        category_id: data.categoryId ?? null,
        short_description: data.shortDescription || null,
        description: data.description || null,
        thumbnail_url: data.thumbnailUrl || null,
        requirements_note: data.requirementsNote || null,
        order_capacity: data.orderCapacity ?? null,
        status: data.status,
        academic_category_id: data.categoryId ?? null,
      };

      if (data.id) {
        const { data: before } = await context.supabase
          .from("services")
          .select("*")
          .eq("id", data.id)
          .maybeSingle();
        const { data: after, error } = await context.supabase
          .from("services")
          .update(payload)
          .eq("id", data.id)
          .select()
          .maybeSingle();
        if (error) return { forbidden: false as const, ok: false, message: error.message };
        await helpers.writeAudit(context as Ctx, {
          action: "service.update",
          entityType: "services",
          entityId: data.id,
          before,
          after,
        });
        return { forbidden: false as const, ok: true, message: "Layanan diperbarui." };
      }

      const { data: after, error } = await context.supabase
        .from("services")
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "service.create",
        entityType: "services",
        entityId: after?.id,
        after,
      });
      return { forbidden: false as const, ok: true, message: "Layanan dibuat." };
    });
  });

export const setServiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "services.update", async (helpers) => {
      const { data: before } = await context.supabase
        .from("services")
        .select("id, status")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await context.supabase
        .from("services")
        .update({ status: data.status })
        .eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: data.status === "published" ? "service.publish" : "service.unpublish",
        entityType: "services",
        entityId: data.id,
        before,
        after: { status: data.status },
      });
      return { forbidden: false as const, ok: true, message: `Status layanan: ${data.status}.` };
    }),
  );

export const deleteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "services.delete", async (helpers) => {
      const { data: before } = await context.supabase
        .from("services")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await context.supabase
        .from("services")
        .update({ deleted_at: new Date().toISOString(), status: "archived" })
        .eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "service.delete",
        entityType: "services",
        entityId: data.id,
        before,
        after: { deleted_at: new Date().toISOString() },
        reason: "Soft delete dari dashboard admin",
      });
      return { forbidden: false as const, ok: true, message: "Layanan dihapus (soft delete)." };
    }),
  );

/* ------------------------------------------------------------------ */
/* Paket & add-on layanan                                               */
/* ------------------------------------------------------------------ */

export const listServiceOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ serviceId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "services.view", async () => {
      const [pkg, addon] = await Promise.all([
        context.supabase
          .from("service_packages")
          .select("*")
          .eq("service_id", data.serviceId)
          .order("sort_order", { ascending: true }),
        context.supabase
          .from("service_addons")
          .select("*")
          .eq("service_id", data.serviceId)
          .order("sort_order", { ascending: true }),
      ]);
      return {
        forbidden: false as const,
        packages: pkg.data ?? [],
        addons: addon.data ?? [],
        error: pkg.error || addon.error ? "Data paket tidak dapat dimuat." : null,
      };
    }),
  );

const packageInput = z.object({
  id: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  price: z.number().int().min(0).max(1_000_000_000),
  estimatedDays: z.number().int().min(1).max(365).default(1),
  freeRevisions: z.number().int().min(0).max(50).default(0),
  slaHours: z.number().int().min(0).max(8760).nullable().optional(),
  priority: z.enum(["normal", "priority", "express"]).default("normal"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const saveServicePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => packageInput.parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, data.id ? "services.update" : "services.create", async (helpers) => {
      const payload = {
        service_id: data.serviceId,
        name: data.name,
        description: data.description || null,
        price: data.price,
        estimated_days: data.estimatedDays,
        free_revisions: data.freeRevisions,
        sla_hours: data.slaHours ?? null,
        priority: data.priority,
        is_active: data.isActive,
        sort_order: data.sortOrder,
      };
      const q = data.id
        ? context.supabase
            .from("service_packages")
            .update(payload)
            .eq("id", data.id)
            .select()
            .maybeSingle()
        : context.supabase.from("service_packages").insert(payload).select().maybeSingle();
      const { data: after, error } = await q;
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: data.id ? "service_package.update" : "service_package.create",
        entityType: "service_packages",
        entityId: after?.id ?? data.id,
        after,
      });
      return {
        forbidden: false as const,
        ok: true,
        message: data.id ? "Paket diperbarui." : "Paket ditambahkan.",
      };
    }),
  );

export const deleteServicePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "services.delete", async (helpers) => {
      const { data: before } = await context.supabase
        .from("service_packages")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await context.supabase.from("service_packages").delete().eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "service_package.delete",
        entityType: "service_packages",
        entityId: data.id,
        before,
      });
      return { forbidden: false as const, ok: true, message: "Paket dihapus." };
    }),
  );

const addonInput = z.object({
  id: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  price: z.number().int().min(0).max(1_000_000_000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const saveServiceAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => addonInput.parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, data.id ? "services.update" : "services.create", async (helpers) => {
      const payload = {
        service_id: data.serviceId,
        name: data.name,
        description: data.description || null,
        price: data.price,
        is_active: data.isActive,
        sort_order: data.sortOrder,
      };
      const q = data.id
        ? context.supabase
            .from("service_addons")
            .update(payload)
            .eq("id", data.id)
            .select()
            .maybeSingle()
        : context.supabase.from("service_addons").insert(payload).select().maybeSingle();
      const { data: after, error } = await q;
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: data.id ? "service_addon.update" : "service_addon.create",
        entityType: "service_addons",
        entityId: after?.id ?? data.id,
        after,
      });
      return {
        forbidden: false as const,
        ok: true,
        message: data.id ? "Add-on diperbarui." : "Add-on ditambahkan.",
      };
    }),
  );

export const deleteServiceAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "services.delete", async (helpers) => {
      const { data: before } = await context.supabase
        .from("service_addons")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      const { error } = await context.supabase.from("service_addons").delete().eq("id", data.id);
      if (error) return { forbidden: false as const, ok: false, message: error.message };
      await helpers.writeAudit(context as Ctx, {
        action: "service_addon.delete",
        entityType: "service_addons",
        entityId: data.id,
        before,
      });
      return { forbidden: false as const, ok: true, message: "Add-on dihapus." };
    }),
  );

/* ------------------------------------------------------------------ */
/* Pengguna, peran, izin                                                */
/* ------------------------------------------------------------------ */

const ALL_ROLES = ["customer", "operator", "support", "finance", "admin", "super_admin"] as const;

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional().default(""),
        role: z
          .enum(["all", ...ALL_ROLES])
          .optional()
          .default("all"),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(5).max(50).optional().default(10),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "users.view", async () => {
      const from = (data.page - 1) * data.pageSize;
      let q = context.supabase
        .from("profiles")
        .select("id, full_name, email, phone, created_at", { count: "exact" });

      if (data.search) {
        const s = data.search.toLowerCase();
        q = q.or(`email.ilike.%${s}%,full_name.ilike.%${data.search}%`);
      }

      const {
        data: profiles,
        count,
        error,
      } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);

      if (error)
        return {
          forbidden: false as const,
          items: [],
          total: 0,
          error: "Data pengguna tidak dapat dimuat.",
        };

      const ids = (profiles ?? []).map((p: { id: string }) => p.id);
      const { data: roleRows } = ids.length
        ? await context.supabase.from("user_roles").select("user_id, role").in("user_id", ids)
        : { data: [] };

      const rolesByUser = new Map<string, string[]>();
      for (const r of roleRows ?? []) {
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(r.role);
        rolesByUser.set(r.user_id, list);
      }

      let items = (profiles ?? []).map((p: any) => ({
        userId: p.id as string,
        fullName: p.full_name as string | null,
        email: p.email as string | null,
        phone: p.phone as string | null,
        createdAt: p.created_at as string,
        roles: rolesByUser.get(p.id) ?? [],
      }));

      if (data.role !== "all") items = items.filter((u) => u.roles.includes(data.role));

      return { forbidden: false as const, items, total: count ?? 0, error: null };
    }),
  );

export const changeUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(ALL_ROLES),
        action: z.enum(["assign", "remove"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "roles.manage", async (helpers) => {
      const ctx = context as Ctx;

      if (data.userId === ctx.userId) {
        return {
          forbidden: false as const,
          ok: false,
          message: "Anda tidak dapat mengubah peran akun sendiri (proteksi privilege escalation).",
        };
      }

      const access = await helpers.loadAccess(ctx);
      if (data.role === "super_admin" && !access.isSuperAdmin) {
        return {
          forbidden: false as const,
          ok: false,
          message: "Hanya super admin yang dapat memberi peran super admin.",
        };
      }

      if (data.action === "remove" && data.role === "super_admin") {
        const { count } = await ctx.supabase
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
          return {
            forbidden: false as const,
            ok: false,
            message: "Super admin terakhir tidak boleh dihapus.",
          };
        }
      }

      if (data.action === "assign") {
        const { error } = await ctx.supabase
          .from("user_roles")
          .insert({ user_id: data.userId, role: data.role });
        if (error && !error.message.includes("duplicate")) {
          return { forbidden: false as const, ok: false, message: error.message };
        }
      } else {
        const { error } = await ctx.supabase
          .from("user_roles")
          .delete()
          .eq("user_id", data.userId)
          .eq("role", data.role);
        if (error) return { forbidden: false as const, ok: false, message: error.message };
      }

      await helpers.writeAudit(ctx, {
        action: data.action === "assign" ? "user_role.assign" : "user_role.remove",
        entityType: "user_roles",
        entityId: data.userId,
        after: { role: data.role, action: data.action },
      });

      return {
        forbidden: false as const,
        ok: true,
        message:
          data.action === "assign"
            ? `Peran ${data.role} ditambahkan.`
            : `Peran ${data.role} dicabut.`,
      };
    }),
  );

export const getPermissionMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "permissions.view", async () => {
      const [{ data: perms }, { data: mapping }] = await Promise.all([
        context.supabase
          .from("permissions")
          .select("key, group_name, description, is_transactional")
          .order("key"),
        context.supabase.from("role_permissions").select("role, permission_key"),
      ]);
      return {
        forbidden: false as const,
        permissions: perms ?? [],
        mapping: mapping ?? [],
        roles: ALL_ROLES as unknown as string[],
      };
    }),
  );

export const setRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        role: z.enum(ALL_ROLES),
        permissionKey: z.string().min(3).max(80),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "permissions.manage", async (helpers) => {
      const ctx = context as Ctx;
      const access = await helpers.loadAccess(ctx);

      if (access.roles.includes(data.role) && !access.isSuperAdmin) {
        return {
          forbidden: false as const,
          ok: false,
          message: "Anda tidak dapat mengubah izin peran milik sendiri.",
        };
      }
      if (data.role === "super_admin") {
        return {
          forbidden: false as const,
          ok: false,
          message: "Izin super admin dikunci oleh sistem.",
        };
      }

      if (data.enabled) {
        const { error } = await ctx.supabase
          .from("role_permissions")
          .insert({ role: data.role, permission_key: data.permissionKey, granted_by: ctx.userId });
        if (error && !error.message.includes("duplicate")) {
          return { forbidden: false as const, ok: false, message: error.message };
        }
      } else {
        const { error } = await ctx.supabase
          .from("role_permissions")
          .delete()
          .eq("role", data.role)
          .eq("permission_key", data.permissionKey);
        if (error) return { forbidden: false as const, ok: false, message: error.message };
      }

      await helpers.writeAudit(ctx, {
        action: "role_permission.update",
        entityType: "role_permissions",
        after: { role: data.role, permission: data.permissionKey, enabled: data.enabled },
      });

      return { forbidden: false as const, ok: true, message: "Izin peran diperbarui." };
    }),
  );

/* ------------------------------------------------------------------ */
/* Audit log                                                            */
/* ------------------------------------------------------------------ */

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional().default(""),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(5).max(50).optional().default(15),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "audit_logs.view", async () => {
      const from = (data.page - 1) * data.pageSize;
      let q = context.supabase
        .from("audit_logs")
        .select(
          "id, action, entity_type, entity_id, actor_id, actor_role, reason, ip, created_at, before_json, after_json",
          {
            count: "exact",
          },
        );
      if (data.search) q = q.ilike("action", `%${data.search}%`);

      const {
        data: items,
        count,
        error,
      } = await q.order("created_at", { ascending: false }).range(from, from + data.pageSize - 1);

      if (error)
        return {
          forbidden: false as const,
          items: [],
          total: 0,
          error: "Audit log tidak dapat dimuat.",
        };
      return { forbidden: false as const, items: items ?? [], total: count ?? 0, error: null };
    }),
  );
