import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "verify_manual_payment",
  title: "Verifikasi pembayaran manual",
  description:
    "Menyetujui atau menolak bukti transfer manual. Persetujuan akan menandai pesanan lunas dan menerbitkan hak akses produk digital.",
  inputSchema: {
    payment_id: z.string().uuid().describe("ID pembayaran yang diverifikasi."),
    decision: z.enum(["approve", "reject"]).describe("approve = sahkan, reject = tolak bukti."),
    reason: z.string().trim().max(500).optional().describe("Alasan keputusan (wajib untuk penolakan)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ payment_id, decision, reason }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (decision === "reject" && !reason) return errorResult("Alasan wajib diisi saat menolak pembayaran.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("verify_manual_payment", {
      _payment_id: payment_id,
      _decision: decision,
      _reason: reason ?? null,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
