import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

function decodeBase64(value: string): Uint8Array {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default defineTool({
  name: "hermes_deliver_result",
  title: "Kirim hasil pekerjaan ke pembeli",
  description:
    "Mengirim hasil pengerjaan jasa ke pembeli: ringkasan, catatan pengiriman, tautan hasil (Drive/link), dan opsional berkas yang diunggah langsung. Pesanan otomatis berpindah ke status menunggu review pembeli.",
  inputSchema: {
    order_id: z.string().uuid().describe("ID pesanan jasa."),
    summary: z.string().trim().min(5).max(2000).describe("Ringkasan hasil pekerjaan untuk pembeli."),
    delivery_note: z.string().trim().max(2000).optional().describe("Catatan tambahan/cara pakai hasil."),
    result_url: z.string().trim().url().max(500).optional().describe("Tautan hasil, mis. Google Drive."),
    file_base64: z.string().min(16).optional().describe("Isi berkas hasil dalam base64 (maks ~40MB)."),
    file_name: z.string().trim().max(160).optional().describe("Nama berkas, mis. laporan.pdf."),
    file_mime: z.string().trim().max(120).optional().describe("Tipe MIME berkas, mis. application/pdf."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ order_id, summary, delivery_note, result_url, file_base64, file_name, file_mime }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    let uploadedUrl: string | null = null;
    if (file_base64) {
      if (!file_name) return errorResult("file_name wajib diisi bila mengirim berkas.");
      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(file_base64);
      } catch {
        return errorResult("file_base64 bukan base64 yang valid.");
      }
      const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${order_id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("job-results")
        .upload(path, bytes, { contentType: file_mime || "application/octet-stream", upsert: false });
      if (uploadError) return errorResult(`Unggah berkas gagal: ${uploadError.message}`);
      const { data: signed, error: signError } = await supabase.storage
        .from("job-results")
        .createSignedUrl(path, YEAR_SECONDS);
      if (signError || !signed?.signedUrl) return errorResult("Berkas terunggah tetapi tautan gagal dibuat.");
      uploadedUrl = signed.signedUrl;
    }

    const finalUrl = result_url ?? uploadedUrl;
    const note = [delivery_note, uploadedUrl && result_url ? `Berkas hasil: ${uploadedUrl}` : null]
      .filter(Boolean)
      .join("\n\n");

    const { data, error } = await supabase.rpc("submit_job_result", {
      _order_id: order_id,
      _summary: summary,
      _delivery_note: note || null,
      _result_url: finalUrl,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data, result_url: finalUrl });
  },
});
