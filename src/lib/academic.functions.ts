import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tx = () => import("./transaction.server");

type Ctx = { supabase: any; userId: string };

const academicSchema = z.object({
  course_name: z.string().trim().min(2).max(120),
  study_program: z.string().trim().min(2).max(120),
  education_level: z.enum(["d3", "s1", "s2", "s3"]),
  assignment_title: z.string().trim().min(3).max(200),
  assignment_description: z.string().trim().min(20).max(4000),
  lecturer_instructions: z.string().trim().max(4000).optional().default(""),
  official_deadline_at: z.string().min(10).max(40),
  customer_timezone: z.string().trim().min(2).max(60),
  language: z.string().trim().min(2).max(20),
  output_type: z.string().trim().min(2).max(40),
  file_format: z.string().trim().min(2).max(20),
  citation_style: z.string().trim().max(20).optional().default(""),
  estimated_pages: z.string().trim().max(6).optional().default(""),
  institution_name: z.string().trim().max(160).optional().default(""),
  software_required: z.string().trim().max(160).optional().default(""),
  dataset_description: z.string().trim().max(1000).optional().default(""),
  presentation_duration: z.string().trim().max(6).optional().default(""),
  special_notes: z.string().trim().max(1000).optional().default(""),
  extra_fields: z.record(z.string(), z.string().trim().max(1000)).default({}),
});

/** Estimasi harga akademik — perhitungan tetap dilakukan server/database. */
export const quoteAcademicOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        serviceId: z.string().uuid(),
        packageId: z.string().uuid(),
        addonIds: z.array(z.string().uuid()).max(20).default([]),
        deadline: z.string().max(40).nullable().optional(),
        reviewerRequested: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("quote_academic_order", {
      _service_id: data.serviceId,
      _package_id: data.packageId,
      _addon_ids: data.addonIds,
      _deadline: data.deadline || null,
      _reviewer_requested: data.reviewerRequested,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return { ok: true as const, quote: result as Record<string, number | string> };
  });

export const createAcademicOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        serviceId: z.string().uuid(),
        packageId: z.string().uuid(),
        addonIds: z.array(z.string().uuid()).max(20).default([]),
        academic: academicSchema,
        scopeFlags: z.array(z.string().max(40)).max(12).default([]),
        reviewerRequested: z.boolean().default(false),
        integrityAccepted: z.boolean(),
        noCredentialAccepted: z.boolean(),
        draftKey: z.string().uuid().nullable().optional(),
        idempotencyKey: z.string().min(8).max(64),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { isFeatureEnabled } = await import("./website-settings.server");
    for (const flag of ["feature_checkout", "feature_academic_services"]) {
      if (!(await isFeatureEnabled(flag)))
        return {
          ok: false as const,
          error: "Fitur ini sedang dinonaktifkan sementara oleh admin.",
        };
    }
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("create_academic_order", {
      _service_id: data.serviceId,
      _package_id: data.packageId,
      _addon_ids: data.addonIds,
      _academic: data.academic,
      _scope_flags: data.scopeFlags,
      _reviewer_requested: data.reviewerRequested,
      _integrity_accepted: data.integrityAccepted,
      _no_credential_accepted: data.noCredentialAccepted,
      _draft_key: data.draftKey ?? null,
      _idempotency_key: data.idempotencyKey,
      _customer_note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return {
      ok: true as const,
      ...(result as {
        order_id: string;
        order_number: string;
        duplicate: boolean;
        urgency_level: string;
      }),
    };
  });

/* ---------------- Lampiran akademik ---------------- */

const ATTACHMENT_TYPES = [
  "assignment_instruction",
  "rubric",
  "template",
  "draft",
  "dataset",
  "reference",
  "lecturer_feedback",
  "supporting_document",
] as const;

export const registerAcademicAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        draftKey: z.string().uuid(),
        attachmentType: z.enum(ATTACHMENT_TYPES),
        storagePath: z.string().min(3).max(400),
        originalName: z.string().min(1).max(200),
        mimeType: z.string().max(120).optional(),
        fileSize: z
          .number()
          .int()
          .min(1)
          .max(20 * 1024 * 1024),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!data.storagePath.startsWith(`${ctx.userId}/`)) {
      return { ok: false as const, error: "Jalur berkas tidak valid." };
    }
    // Metadata dari klien adalah klaim. Objek storage adalah fakta: berkas harus
    // benar-benar ada, dan ukuran/MIME yang dicatat diambil dari objek asli
    // supaya baris tidak bisa memuat angka atau tipe palsu.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: listing, error: listError } = await supabaseAdmin.storage
      .from("academic-order-attachments")
      .list(data.storagePath.split("/").slice(0, -1).join("/"), {
        search: data.storagePath.split("/").pop(),
      });
    const object = (listing ?? []).find(
      (entry) => entry.name === data.storagePath.split("/").pop(),
    );
    if (listError || !object) {
      return { ok: false as const, error: "Berkas belum terunggah sepenuhnya. Unggah ulang." };
    }
    const actualSize = Number((object.metadata as { size?: number } | null)?.size ?? 0);
    const actualMime = String((object.metadata as { mimetype?: string } | null)?.mimetype ?? "");
    if (actualSize < 1 || actualSize > 20 * 1024 * 1024) {
      return { ok: false as const, error: "Ukuran berkas tidak sesuai batas." };
    }
    if (data.fileSize !== actualSize) {
      return {
        ok: false as const,
        error: "Ukuran berkas tidak cocok dengan berkas yang diunggah.",
      };
    }
    if (data.mimeType && actualMime && data.mimeType !== actualMime) {
      return { ok: false as const, error: "Tipe berkas tidak cocok dengan berkas yang diunggah." };
    }
    const { data: row, error } = await ctx.supabase
      .from("academic_order_attachments")
      .insert({
        draft_key: data.draftKey,
        uploaded_by: ctx.userId,
        attachment_type: data.attachmentType,
        storage_path: data.storagePath,
        original_name: data.originalName,
        mime_type: actualMime || data.mimeType || null,
        file_size: actualSize,
      })
      .select("id, attachment_type, original_name, file_size, created_at")
      .maybeSingle();

    if (error) {
      console.error("[akademik] gagal menyimpan lampiran:", error.message);
      return { ok: false as const, error: "Lampiran gagal disimpan. Coba lagi." };
    }
    return { ok: true as const, attachment: row };
  });

export const listDraftAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ draftKey: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context as Ctx).supabase
      .from("academic_order_attachments")
      .select("id, attachment_type, original_name, file_size, created_at")
      .eq("draft_key", data.draftKey)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return { items: [], error: "Daftar lampiran tidak dapat dimuat." as const };
    return { items: rows ?? [], error: null };
  });

export const removeDraftAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase
      .from("academic_order_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("order_id", null);
    return { ok: !error };
  });
