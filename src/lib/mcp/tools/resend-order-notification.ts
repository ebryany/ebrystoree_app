import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "resend_order_notification",
  title: "Kirim ulang notifikasi pesanan",
  description:
    "Mengirim ulang notifikasi status pesanan ke pemesan, misalnya pengingat pembayaran atau kabar pesanan selesai. Pesan bisa disesuaikan.",
  inputSchema: {
    order_id: z.string().uuid().describe("ID pesanan."),
    title: z.string().trim().max(120).optional().describe("Judul notifikasi; otomatis bila kosong."),
    message: z.string().trim().max(500).optional().describe("Isi pesan; otomatis dari status pesanan bila kosong."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ order_id, title, message }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_number, user_id, status, total, expired_at")
      .eq("id", order_id)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!order) return errorResult("Pesanan tidak ditemukan atau tidak dapat diakses.");

    const finalTitle = title ?? `Update pesanan ${order.order_number}`;
    const finalMessage =
      message ??
      (order.status === "awaiting_payment"
        ? `Pesanan ${order.order_number} masih menunggu pembayaran. Selesaikan pembayaran agar pesanan diproses.`
        : `Status pesanan ${order.order_number} saat ini: ${order.status}.`);

    const { data, error: rpcError } = await supabase.rpc("admin_broadcast_notification", {
      _title: finalTitle,
      _message: finalMessage,
      _audience: "users",
      _role: null,
      _user_ids: [order.user_id],
      _type: "order_update",
      _link: `/dashboard/pesanan/${order.id}`,
    });
    if (rpcError) return errorResult(rpcError.message);

    await supabase.rpc("write_audit_log", {
      _action: "order.notification_resent",
      _entity_type: "orders",
      _entity_id: order.id,
      _before: null,
      _after: { title: finalTitle, message: finalMessage },
      _reason: "mcp resend_order_notification",
      _ip: null,
      _trace_id: null,
    });

    return jsonResult({ ok: true, order_number: order.order_number, hasil: data ?? null });
  },
});
