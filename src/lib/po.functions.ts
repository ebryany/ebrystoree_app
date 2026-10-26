import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";

type Ctx = { supabase: any; userId: string };

function rpcError(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  return clean.length > 3 ? clean : "Aksi gagal diproses. Coba lagi.";
}

const REQUEST_FIELDS =
  "id, request_number, user_id, title, description, category_id, reference_url, budget_estimate, deadline_at, status, quoted_total, dp_percent, dp_amount, quote_note, quoted_at, result_note, result_url, delivered_at, completed_at, cancelled_at, cancel_reason, last_message_at, created_at";

/* ---------------- Pelanggan ---------------- */

export const createPoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        title: z.string().trim().min(5).max(120),
        description: z.string().trim().min(20).max(4000),
        categoryId: z.string().uuid().optional(),
        referenceUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
        budgetEstimate: z.number().int().min(0).max(1_000_000_000).optional(),
        deadlineAt: z.string().datetime().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "po.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: row, error } = await supabase
      .from("custom_orders")
      .insert({
        user_id: userId,
        title: data.title,
        description: data.description,
        category_id: data.categoryId ?? null,
        reference_url: data.referenceUrl || null,
        budget_estimate: data.budgetEstimate ?? null,
        deadline_at: data.deadlineAt ?? null,
      })
      .select("id, request_number")
      .maybeSingle();
    if (error || !row) return { ok: false as const, error: rpcError(error?.message ?? "Permintaan gagal dibuat.") };

    await supabase.from("po_messages").insert({
      request_id: row.id,
      sender_id: userId,
      sender_role: "customer",
      body: data.description,
    });

    return { ok: true as const, id: row.id as string, requestNumber: row.request_number as string };
  });

export const listMyPoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("custom_orders")
      .select(REQUEST_FIELDS)
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(50);
    if (error) return { items: [], error: "Daftar PO tidak dapat dimuat." as const };
    return { items: data ?? [], error: null };
  });

export const listAllPoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ status: z.string().max(30).optional() }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let query = supabase
      .from("custom_orders")
      .select(REQUEST_FIELDS)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) return { items: [], error: "Daftar PO tidak dapat dimuat." as const };

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const nameById = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.full_name || p.email || "Pelanggan");
    }
    return {
      items: (rows ?? []).map((r: any) => ({ ...r, customer_name: nameById.get(r.user_id) ?? "Pelanggan" })),
      error: null,
    };
  });

export const getPoRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "po.message");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: request } = await supabase
      .from("custom_orders")
      .select(REQUEST_FIELDS)
      .eq("id", data.id)
      .maybeSingle();
    if (!request) return { request: null, messages: [], payments: [], isOwner: false, customerName: null };

    const [{ data: messages }, { data: payments }, { data: profile }] = await Promise.all([
      supabase
        .from("po_messages")
        .select("id, sender_id, sender_role, body, attachment_path, is_system, created_at")
        .eq("request_id", data.id)
        .order("created_at", { ascending: true })
        .limit(300),
      supabase
        .from("po_payments")
        .select("id, stage, amount, status, proof_path, sender_name, note, reject_reason, verified_at, created_at")
        .eq("request_id", data.id)
        .order("created_at", { ascending: true }),
      supabase.from("profiles").select("full_name, email").eq("id", request.user_id).maybeSingle(),
    ]);

    return {
      request,
      messages: messages ?? [],
      payments: payments ?? [],
      isOwner: request.user_id === userId,
      customerName: profile?.full_name || profile?.email || "Pelanggan",
    };
  });

export const sendPoMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ requestId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: request } = await supabase
      .from("custom_orders")
      .select("id, user_id, request_number, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!request) return { ok: false as const, error: "Permintaan tidak ditemukan." };
    if (request.status === "cancelled") return { ok: false as const, error: "Permintaan sudah dibatalkan." };

    const isOwner = request.user_id === userId;
    const { error } = await supabase.from("po_messages").insert({
      request_id: data.requestId,
      sender_id: userId,
      sender_role: isOwner ? "customer" : "staff",
      body: data.body,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };

    if (!isOwner) {
      // Staff sudah terverifikasi (pesan staff lolos RLS di atas); notifikasi ditulis via admin client
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notifications").insert({
        recipient_id: request.user_id,
        type: "po_message",
        title: "Balasan tim untuk PO Anda",
        message: `Ada pesan baru di ${request.request_number}.`,
        related_type: "custom_order",
        related_id: request.id,
      });
    }
    return { ok: true as const };
  });

export const respondPoQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        accept: z.boolean(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("po_respond_quote", {
      _request_id: data.requestId,
      _accept: data.accept,
      _note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const submitPoProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        filePath: z.string().min(3).max(300),
        senderName: z.string().trim().min(2).max(100),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("po_submit_payment_proof", {
      _payment_id: data.paymentId,
      _file_path: data.filePath,
      _sender_name: data.senderName,
      _note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const cancelPoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(5).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("po_cancel_request", {
      _request_id: data.requestId,
      _reason: data.reason,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

/* ---------------- Tim / admin ---------------- */

export const submitPoQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        total: z.number().int().min(1000).max(1_000_000_000),
        dpPercent: z.number().int().min(10).max(100),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("po_submit_quote", {
      _request_id: data.requestId,
      _total: data.total,
      _dp_percent: data.dpPercent,
      _note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const verifyPoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("po_verify_payment", {
      _payment_id: data.paymentId,
      _decision: data.decision,
      _reason: data.reason ?? null,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const deliverPoResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        note: z.string().trim().max(1000).optional(),
        resultUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("po_deliver", {
      _request_id: data.requestId,
      _note: data.note ?? null,
      _result_url: data.resultUrl || null,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const getPoProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: payment } = await supabase
      .from("po_payments")
      .select("proof_path")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!payment?.proof_path) return { url: null as string | null };
    const { data: signed } = await supabase.storage
      .from("payment-proofs")
      .createSignedUrl(payment.proof_path, 300);
    return { url: signed?.signedUrl ?? null };
  });