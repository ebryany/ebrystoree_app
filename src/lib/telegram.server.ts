/**
 * Server-only: notifikasi Telegram untuk pemilik toko (alur Hermes).
 * Gateway connector Lovable dipakai agar token bot tidak pernah ada di kode.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function telegramReady(): boolean {
  return Boolean(env("LOVABLE_API_KEY") && env("TELEGRAM_API_KEY") && env("TELEGRAM_OWNER_CHAT_ID"));
}

export async function sendTelegramMessage(text: string, chatId?: string): Promise<{ ok: boolean; error?: string }> {
  const lovableKey = env("LOVABLE_API_KEY");
  const connectionKey = env("TELEGRAM_API_KEY");
  const target = chatId ?? env("TELEGRAM_OWNER_CHAT_ID");
  if (!lovableKey || !connectionKey || !target) return { ok: false, error: "telegram not configured" };

  const response = await fetch(`${GATEWAY}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: target, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[telegram] gagal kirim [${response.status}]: ${body}`);
    return { ok: false, error: `${response.status} ${body}` };
  }
  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!payload.ok) {
    console.error(`[telegram] provider menolak: ${payload.description}`);
    return { ok: false, error: payload.description ?? "telegram error" };
  }
  return { ok: true };
}

function rupiah(value: number | string | null): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function siteUrl(path: string): string {
  const base = env("PUBLIC_SITE_URL") ?? "https://ebrystore.my.id";
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Kirim pesan Telegram untuk setiap pesanan jasa berbayar yang belum pernah diberitahukan.
 * Idempotent lewat tabel telegram_dispatch_log.
 */
export async function dispatchServiceOrderAlerts(limit = 20): Promise<{ sent: number; skipped: number }> {
  if (!telegramReady()) return { sent: 0, skipped: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status, total, created_at, paid_at, customer_note, user_id")
    .eq("order_type", "service")
    .in("status", ["academic_review", "waiting_assignment", "queued", "assigned"])
    .not("paid_at", "is", null)
    .order("paid_at", { ascending: true })
    .limit(limit);

  const rows = orders ?? [];
  if (!rows.length) return { sent: 0, skipped: 0 };

  const ids = rows.map((o) => o.id);
  const { data: logged } = await supabaseAdmin
    .from("telegram_dispatch_log")
    .select("order_id")
    .eq("event", "service_order_paid")
    .in("order_id", ids);
  const done = new Set((logged ?? []).map((l: { order_id: string }) => l.order_id));

  const pending = rows.filter((o) => !done.has(o.id));
  if (!pending.length) return { sent: 0, skipped: rows.length };

  const pendingIds = pending.map((o) => o.id);
  const [{ data: items }, { data: details }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("order_items").select("order_id, name_snapshot, item_type").in("order_id", pendingIds),
    supabaseAdmin
      .from("service_order_details")
      .select("order_id, requirements_note, estimated_days, customer_deadline")
      .in("order_id", pendingIds),
    supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(new Set(pending.map((o) => o.user_id).filter(Boolean) as string[]))),
  ]);

  const detailMap = new Map((details ?? []).map((d: { order_id: string }) => [d.order_id, d as any]));
  const profileMap = new Map((profiles ?? []).map((p: { id: string }) => [p.id, p as any]));

  let sent = 0;
  for (const order of pending) {
    const service =
      (items ?? []).find((i: any) => i.order_id === order.id && i.item_type === "service")?.name_snapshot ?? "Layanan";
    const detail = detailMap.get(order.id);
    const buyer = order.user_id ? profileMap.get(order.user_id) : null;
    const lines = [
      "🧾 <b>Pesanan jasa baru (sudah dibayar)</b>",
      `No: <code>${order.order_number}</code>`,
      `Layanan: ${service}`,
      `Nilai: ${rupiah(order.total)}`,
      buyer ? `Pembeli: ${buyer.full_name || buyer.email}` : null,
      detail?.estimated_days ? `Estimasi: ${detail.estimated_days} hari` : null,
      detail?.customer_deadline ? `Deadline pembeli: ${detail.customer_deadline}` : null,
      order.customer_note ? `Catatan: ${order.customer_note}` : null,
      detail?.requirements_note ? `Kebutuhan: ${detail.requirements_note}` : null,
      "",
      `Kelola: ${siteUrl(`/admin/pengerjaan/${order.id}`)}`,
      `ID pesanan: <code>${order.id}</code>`,
    ].filter(Boolean) as string[];

    const result = await sendTelegramMessage(lines.join("\n"));
    if (!result.ok) continue;
    await supabaseAdmin.from("telegram_dispatch_log").insert({ order_id: order.id, event: "service_order_paid" });
    sent += 1;
  }

  return { sent, skipped: rows.length - sent };
}
