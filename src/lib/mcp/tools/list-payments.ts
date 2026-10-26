import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_payments",
  title: "Daftar pembayaran",
  description:
    "Menampilkan pembayaran beserta status, metode, nominal, dan bukti transfer manual yang menunggu verifikasi.",
  inputSchema: {
    status: z.string().trim().max(40).optional().describe("Filter status pembayaran, mis. pending_verification, paid."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("payments")
      .select(
        "id, payment_number, order_id, provider, method, status, currency, expected_amount, paid_amount, expired_at, paid_at, created_at, manual_payment_proofs(id, sender_name, amount_claimed, status, submitted_at, customer_note)",
      );
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});
