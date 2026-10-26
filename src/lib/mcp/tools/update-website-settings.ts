import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { FIELD_BY_KEY, SETTING_SECTIONS, redact, validateField } from "@/lib/website-settings";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_website_settings",
  title: "Ubah pengaturan website",
  description:
    "Mengubah satu atau beberapa pengaturan website berdasarkan key (mis. store_name, site_tagline, site_accent_color, feature flag, maintenance_active). Nilai divalidasi; jika ada satu yang tidak valid, tidak ada yang disimpan.",
  inputSchema: {
    values: z
      .record(z.string().max(80), z.unknown())
      .describe('Peta key -> nilai baru, contoh {"site_tagline":"Belanja digital lebih mudah"}.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ values }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const entries = Object.entries(values ?? {});
    if (!entries.length) return errorResult("Tidak ada nilai yang dikirim.");

    const normalized: { key: string; value: unknown; isPublic: boolean; section: string }[] = [];
    for (const [key, raw] of entries) {
      const field = FIELD_BY_KEY.get(key);
      if (!field) return errorResult(`Key "${key}" tidak dikenal. Pakai get_website_settings untuk melihat key yang tersedia.`);
      if (field.readOnly) return errorResult(`Key "${key}" hanya bisa dibaca.`);
      const result = validateField(field, raw);
      if (!result.ok) return errorResult(`${field.label}: ${result.error}`);
      const section = SETTING_SECTIONS.find((s) => s.fields.some((f) => f.key === key));
      normalized.push({ key, value: result.value, isPublic: field.isPublic, section: section?.id ?? "lain" });
    }

    const supabase = supabaseForUser(ctx);
    const { data: existing } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", normalized.map((n) => n.key));
    const before = new Map((existing ?? []).map((r: any) => [r.key, r.value]));

    const changed = normalized.filter((n) => JSON.stringify(before.get(n.key)) !== JSON.stringify(n.value));
    if (!changed.length) return jsonResult({ changed: 0, note: "Nilai sudah sama, tidak ada perubahan." });

    const { error } = await supabase
      .from("system_settings")
      .upsert(changed.map((n) => ({ key: n.key, value: n.value, is_public: n.isPublic })), { onConflict: "key" });
    if (error) return errorResult(`Gagal menyimpan: ${error.message}`);

    for (const item of changed) {
      const field = FIELD_BY_KEY.get(item.key)!;
      const action =
        item.key === "maintenance_active"
          ? item.value
            ? "maintenance_enabled"
            : "maintenance_disabled"
          : item.key.startsWith("feature_")
            ? "feature_flag_changed"
            : before.has(item.key)
              ? "website_setting_updated"
              : "website_setting_created";
      await supabase.rpc("write_audit_log", {
        _action: action,
        _entity_type: "website_setting",
        _entity_id: null,
        _before: { [item.key]: redact(field, before.get(item.key) ?? null) },
        _after: { [item.key]: redact(field, item.value) },
        _reason: `mcp group=${item.section} key=${item.key}`,
        _ip: null,
        _trace_id: null,
      });
    }

    return jsonResult({
      changed: changed.length,
      keys: changed.map((c) => c.key),
    });
  },
});
