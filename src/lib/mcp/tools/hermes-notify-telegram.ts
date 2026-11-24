import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  authGuard,
  enforceMcpRateLimit,
  errorResult,
  jsonResult,
  requireMcpPermission,
  supabaseForUser,
} from "../supabase";

export default defineTool({
  name: "hermes_notify_telegram",
  title: "Kirim pesan Telegram ke pemilik toko",
  description:
    "Mengirim pesan Telegram ke chat pemilik toko, mis. pengingat pesanan jasa baru atau ringkasan pekerjaan. Hanya untuk akun dengan izin pengerjaan pesanan.",
  inputSchema: {
    message: z.string().trim().min(3).max(3500).describe("Isi pesan (mendukung HTML dasar Telegram)."),
    dispatch_pending_orders: z
      .boolean()
      .optional()
      .describe("true = sekaligus kirim notifikasi pesanan jasa berbayar yang belum diberitahukan."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async ({ message, dispatch_pending_orders }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    const permDenied = await requireMcpPermission(supabase, ctx, "orders.fulfill");
    if (permDenied) return permDenied;
    const limited = await enforceMcpRateLimit(ctx, "mcp.notify");
    if (limited) return limited;

    const telegram = await import("@/lib/telegram.server");
    const sent = await telegram.sendTelegramMessage(message);
    if (!sent.ok) {
      console.error("[mcp:hermes_notify_telegram] gagal:", sent.error);
      return errorResult("Gagal mengirim pesan Telegram.");
    }

    let dispatched: { sent: number; skipped: number } | null = null;
    if (dispatch_pending_orders) dispatched = await telegram.dispatchServiceOrderAlerts();

    return jsonResult({ ok: true, dispatched });
  },
});
