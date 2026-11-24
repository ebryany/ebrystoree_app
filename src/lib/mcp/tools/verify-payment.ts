import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  authGuard,
  enforceMcpRateLimit,
  errorResult,
  jsonResult,
  safeMcpError,
  supabaseForUser,
} from "../supabase";

const DECISION_MAP = {
  approve: "approved",
  reject: "rejected",
  request_reupload: "reupload_requested",
} as const;

export default defineTool({
  name: "verify_manual_payment",
  title: "Verifikasi pembayaran manual",
  description:
    "Menyetujui, menolak, atau meminta unggah ulang bukti transfer manual. Persetujuan akan menandai pesanan lunas dan menerbitkan hak akses produk digital.",
  inputSchema: {
    payment_id: z.string().uuid().describe("ID pembayaran yang diverifikasi."),
    decision: z
      .enum(["approve", "reject", "request_reupload"])
      .describe("approve = sahkan, reject = tolak bukti, request_reupload = minta unggah ulang."),
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("Alasan keputusan (wajib untuk penolakan atau permintaan unggah ulang)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ payment_id, decision, reason }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (decision !== "approve" && (!reason || reason.length < 3)) {
      return errorResult("Alasan minimal 3 karakter wajib diisi saat menolak atau meminta unggah ulang.");
    }
    const limited = await enforceMcpRateLimit(ctx, "admin.payment.decision");
    if (limited) return limited;

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("verify_manual_payment", {
      _payment_id: payment_id,
      _decision: DECISION_MAP[decision],
      _reason: reason ?? null,
    });
    if (error) return safeMcpError("verify_manual_payment", error);
    return jsonResult({ result: data });
  },
});
