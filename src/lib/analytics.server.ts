/**
 * Server-only: pencatat event analytics dari sisi server.
 *
 * Dipakai untuk event yang TIDAK BOLEH berasal dari klien, terutama konversi
 * pembayaran. Alasannya: hanya server yang tahu pembayaran benar-benar lunas,
 * jadi angka konversi tidak bisa dipalsukan oleh browser.
 *
 * Event ini tidak punya sesi pengunjung, jadi `session_hash` diisi penanda
 * server. Konsekuensinya: event ini TIDAK dihitung sebagai pengunjung unik,
 * hanya sebagai peristiwa konversi. Batas ini dinyatakan di dokumen definisi
 * metrik supaya tidak salah tafsir.
 */

const SERVER_SESSION = "server";

export async function recordServerEvent(params: {
  event: "payment_success";
  path: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("analytics_events").insert({
      event_type: params.event,
      path: params.path.slice(0, 300),
      session_hash: SERVER_SESSION,
      referrer_host: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      // Bukan bot, tapi juga bukan pengunjung: ditandai lewat session_hash.
      is_bot: false,
    });
  } catch (err) {
    // Analitik tidak boleh menggagalkan transaksi yang sudah selesai.
    console.error("[analytics] catat event server gagal:", (err as Error).message);
  }
}
