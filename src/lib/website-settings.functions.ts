import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FIELD_BY_KEY, sectionById, validateField, redact } from "./website-settings";

type Ctx = { supabase: any; userId: string };

const authz = () => import("./authz.server");
const store = () => import("./website-settings.server");

async function guard<T>(context: Ctx, permission: string, run: () => Promise<T>) {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

/* --------------------------- Publik --------------------------- */

export const getPublicWebsiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { readPublicSettings } = await store();
  return readPublicSettings();
});

/* --------------------------- Banner home --------------------------- */

const uploadBannerPayload = z.object({
  name: z.string().min(1).max(200),
  data: z.string().min(1).max(4_200_000),
});

export const uploadBannerImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => uploadBannerPayload.parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "settings.branding.update", async () => {
      const { persistBannerImage } = await import("./banner-upload.server");
      const result = await persistBannerImage(data.data);
      if (!result.ok) return { ok: false as const, error: result.error };
      return { ok: true as const, url: result.url, error: null };
    }),
  );

/* --------------------------- Admin --------------------------- */

export const getWebsiteSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "settings.website.view", async () => {
      const sb = (context as Ctx).supabase;
      const { readAllSettings } = await store();
      try {
        const { values, storedKeys, updatedAt } = await readAllSettings(sb);
        const { data: audits } = await sb
          .from("audit_logs")
          .select("action, reason, created_at, actor_id")
          .eq("entity_type", "website_setting")
          .order("created_at", { ascending: false })
          .limit(1);
        const last = (audits ?? [])[0] ?? null;
        let actorName: string | null = null;
        if (last?.actor_id) {
          const { data: profile } = await sb
            .from("profiles")
            .select("full_name, email")
            .eq("id", last.actor_id)
            .maybeSingle();
          actorName = profile?.full_name || profile?.email || null;
        }
        return { values, storedKeys, updatedAt, lastChange: last, actorName, error: null };
      } catch (e) {
        console.error("[settings] gagal memuat pengaturan admin:", (e as Error).message);
        return {
          values: {},
          storedKeys: [],
          updatedAt: null,
          lastChange: null,
          actorName: null,
          error: "Pengaturan tidak dapat dimuat.",
        };
      }
    }),
  );

const savePayload = z.object({
  section: z.string().min(1).max(40),
  values: z.record(z.string().max(80), z.unknown()),
});

export const saveWebsiteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => savePayload.parse(data))
  .handler(async ({ data, context }) => {
    const section = sectionById(data.section);
    if (!section) return { ok: false as const, error: "Bagian pengaturan tidak dikenal." };

    return guard(context as Ctx, section.permission, async () => {
      const sb = (context as Ctx).supabase;
      const helpers = await authz();

      // 1. Validasi seluruh field lebih dulu — gagal satu, tidak ada yang disimpan.
      const normalized: { key: string; value: unknown; isPublic: boolean }[] = [];
      for (const [key, raw] of Object.entries(data.values)) {
        const field = FIELD_BY_KEY.get(key);
        if (!field) return { ok: false as const, error: `Key "${key}" tidak dikenal.` };
        if (!section.fields.some((f) => f.key === key))
          return { ok: false as const, error: `Key "${key}" bukan bagian dari ${section.label}.` };
        if (field.readOnly) continue;
        const result = validateField(field, raw);
        if (!result.ok) return { ok: false as const, error: result.error };
        normalized.push({ key, value: result.value, isPublic: field.isPublic });
      }

      const { data: existing } = await sb
        .from("system_settings")
        .select("key, value")
        .in(
          "key",
          normalized.map((n) => n.key),
        );
      const before = new Map((existing ?? []).map((r: any) => [r.key, r.value]));

      const changed = normalized.filter(
        (n) => JSON.stringify(before.get(n.key)) !== JSON.stringify(n.value),
      );
      if (!changed.length) return { ok: true as const, changed: 0, error: null };

      const { error } = await sb.from("system_settings").upsert(
        changed.map((n) => ({ key: n.key, value: n.value, is_public: n.isPublic })),
        { onConflict: "key" },
      );
      if (error) {
        console.error("[settings] upsert gagal:", error.message);
        return { ok: false as const, error: "Pengaturan gagal disimpan." };
      }

      for (const item of changed) {
        const field = FIELD_BY_KEY.get(item.key)!;
        const action =
          item.key === "maintenance_active"
            ? item.value
              ? "maintenance_enabled"
              : "maintenance_disabled"
            : item.key.startsWith("feature_")
              ? "feature_flag_changed"
              : section.id === "branding"
                ? "branding_asset_updated"
                : before.has(item.key)
                  ? "website_setting_updated"
                  : "website_setting_created";
        await helpers.writeAudit(context as Ctx, {
          action,
          entityType: "website_setting",
          before: redact(field, before.get(item.key) ?? null),
          after: redact(field, item.value),
          reason: `group=${section.id} key=${item.key}`,
        });
      }

      return { ok: true as const, changed: changed.length, error: null };
    });
  });

export const resetWebsiteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ section: z.string().min(1).max(40) }).parse(data))
  .handler(async ({ data, context }) => {
    const section = sectionById(data.section);
    if (!section) return { ok: false as const, error: "Bagian pengaturan tidak dikenal." };

    return guard(context as Ctx, "settings.dangerous.update", async () => {
      const sb = (context as Ctx).supabase;
      const helpers = await authz();
      const rows = section.fields
        .filter((f) => !f.readOnly)
        .map((f) => ({ key: f.key, value: f.default, is_public: f.isPublic }));

      const { data: existing } = await sb
        .from("system_settings")
        .select("key, value")
        .in(
          "key",
          rows.map((r) => r.key),
        );
      const before = new Map((existing ?? []).map((r: any) => [r.key, r.value]));

      const { error } = await sb.from("system_settings").upsert(rows, { onConflict: "key" });
      if (error) return { ok: false as const, error: "Reset gagal dijalankan." };

      await helpers.writeAudit(context as Ctx, {
        action: "website_setting_reset",
        entityType: "website_setting",
        before: Object.fromEntries(
          rows.map((r) => [r.key, redact(FIELD_BY_KEY.get(r.key)!, before.get(r.key) ?? null)]),
        ),
        after: Object.fromEntries(
          rows.map((r) => [r.key, redact(FIELD_BY_KEY.get(r.key)!, r.value)]),
        ),
        reason: `group=${section.id} reset ke nilai default`,
      });

      return { ok: true as const, error: null };
    });
  });
