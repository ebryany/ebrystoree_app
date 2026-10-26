import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ALL_FIELDS, FIELD_BY_KEY, SETTING_SECTIONS, defaultsFor, redact, sectionById } from "@/lib/website-settings";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_website_settings",
  title: "Lihat pengaturan website",
  description:
    "Menampilkan pengaturan website (nama toko, tagline, kontak, warna, menu, feature flag, maintenance) beserta nilai saat ini dan daftar key yang bisa diubah.",
  inputSchema: {
    section: z.string().trim().max(40).optional().describe("ID bagian, mis. umum/branding/kontak. Kosong = semua."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ section }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const target = section ? sectionById(section) : null;
    if (section && !target) {
      return errorResult(`Bagian "${section}" tidak dikenal. Pilihan: ${SETTING_SECTIONS.map((s) => s.id).join(", ")}`);
    }
    const fields = target ? target.fields : ALL_FIELDS;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.from("system_settings").select("key, value, updated_at");
    if (error) return errorResult(error.message);
    const stored = new Map((data ?? []).map((r: any) => [r.key, r.value]));
    const base = defaultsFor(fields.map((f) => f.key));
    const values = fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      editable: !f.readOnly,
      value: redact(f, stored.has(f.key) ? stored.get(f.key) : base[f.key]),
    }));
    return jsonResult({
      sections: SETTING_SECTIONS.map((s) => ({ id: s.id, label: s.label, description: s.description })),
      section: target?.id ?? "all",
      values,
      unknownKeysAreRejected: true,
      totalFields: FIELD_BY_KEY.size,
    });
  },
});
