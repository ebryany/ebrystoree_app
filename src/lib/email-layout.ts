/**
 * Kerangka HTML email transaksional Ebrystore.
 *
 * Batasan klien email yang menentukan bentuk kode ini:
 * - Outlook tidak mendukung flexbox/grid, jadi struktur memakai <table>.
 * - Banyak klien membuang <style> di <head>, jadi semua gaya ditulis inline.
 * - Gambar sering diblokir, jadi tidak ada informasi penting yang bergantung
 *   pada gambar; header memakai teks, bukan logo gambar.
 * - `oklch()` tidak dikenal klien email, jadi warna memakai hex hasil konversi
 *   dari token Ebrystore (lihat docs/audit/2026-10-05-riset-email-transaksional.md).
 *
 * Semua nilai di bawah berasal dari data nyata yang dioper pemanggil; tidak ada
 * angka contoh di dalam template.
 */

export const EMAIL_COLORS = {
  background: "#FBFAF6",
  card: "#FFFFFF",
  foreground: "#071F21",
  mutedFg: "#54676A",
  primary: "#003F42",
  accent: "#007A7A",
  border: "#D7E0E0",
  success: "#219761",
  warning: "#EBAA2D",
  destructive: "#D01D21",
} as const;

export type EmailStatus = "success" | "pending" | "danger" | null;

export type EmailDetailRow = { label: string; value: string };

export type EmailLayoutInput = {
  /** Judul utama: kalimat aktif yang menyebut apa yang terjadi. */
  heading: string;
  /** Ringkasan 1-2 kalimat di bawah judul. */
  intro: string;
  /** Badge status; null bila email tidak menyatakan status. */
  status?: EmailStatus;
  /** Label badge, mis. "Lunas", "Selesai", "Perlu tindakan". */
  statusLabel?: string;
  /** Baris detail transaksi. Nilai harus dari database, bukan contoh. */
  details?: EmailDetailRow[];
  /** Satu tindakan utama. */
  action?: { label: string; url: string };
  /** Catatan kecil di bawah tombol (langkah lanjutan, peringatan). */
  note?: string;
  /** Teks pratinjau yang muncul di daftar kotak masuk. */
  preview: string;
  /** Tautan berhenti langganan; wajib ada. */
  unsubscribeUrl: string;
  /** Tautan pusat bantuan. */
  helpUrl: string;
};

const FONT_STACK =
  "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STATUS_STYLE: Record<Exclude<EmailStatus, null>, { bg: string; fg: string }> = {
  success: { bg: EMAIL_COLORS.success, fg: "#FFFFFF" },
  pending: { bg: EMAIL_COLORS.warning, fg: "#3A2A05" },
  danger: { bg: EMAIL_COLORS.destructive, fg: "#FFFFFF" },
};

/**
 * Bangun HTML email. Satu kerangka untuk semua tipe supaya tampilannya konsisten
 * dan perbaikannya cukup di satu tempat.
 */
export function renderEmail(input: EmailLayoutInput): string {
  const statusBadge =
    input.status && input.statusLabel
      ? `<tr><td style="padding:0 0 14px 0;">
           <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${STATUS_STYLE[input.status].bg};color:${STATUS_STYLE[input.status].fg};font-size:12px;font-weight:700;letter-spacing:.02em;">${escapeHtml(input.statusLabel)}</span>
         </td></tr>`
      : "";

  const details =
    input.details && input.details.length
      ? `<tr><td style="padding:4px 0 18px 0;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${EMAIL_COLORS.border};border-radius:10px;border-collapse:separate;">
             ${input.details
               .map(
                 (row, index) => `<tr>
                 <td style="padding:11px 14px;${index > 0 ? `border-top:1px solid ${EMAIL_COLORS.border};` : ""}font-size:13px;color:${EMAIL_COLORS.mutedFg};">${escapeHtml(row.label)}</td>
                 <td align="right" style="padding:11px 14px;${index > 0 ? `border-top:1px solid ${EMAIL_COLORS.border};` : ""}font-size:13px;font-weight:600;color:${EMAIL_COLORS.foreground};font-variant-numeric:tabular-nums;">${escapeHtml(row.value)}</td>
               </tr>`,
               )
               .join("")}
           </table>
         </td></tr>`
      : "";

  const action = input.action
    ? `<tr><td style="padding:0 0 16px 0;">
         <a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:${EMAIL_COLORS.accent};color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(input.action.label)}</a>
       </td></tr>`
    : "";

  const note = input.note
    ? `<tr><td style="padding:0 0 6px 0;font-size:13px;line-height:1.6;color:${EMAIL_COLORS.mutedFg};">${escapeHtml(input.note)}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLORS.background};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:0 0 16px 0;">
        <span style="font-family:${FONT_STACK};font-size:17px;font-weight:700;color:${EMAIL_COLORS.primary};letter-spacing:-.01em;">Ebrystore</span>
      </td></tr>
      <tr><td style="background:${EMAIL_COLORS.card};border:1px solid ${EMAIL_COLORS.border};border-radius:14px;padding:26px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${statusBadge}
          <tr><td style="padding:0 0 8px 0;font-family:${FONT_STACK};font-size:20px;font-weight:700;line-height:1.3;color:${EMAIL_COLORS.foreground};">${escapeHtml(input.heading)}</td></tr>
          <tr><td style="padding:0 0 18px 0;font-family:${FONT_STACK};font-size:14px;line-height:1.65;color:${EMAIL_COLORS.mutedFg};">${escapeHtml(input.intro)}</td></tr>
          ${details}
          ${action}
          ${note}
        </table>
      </td></tr>
      <tr><td style="padding:18px 4px 0 4px;font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${EMAIL_COLORS.mutedFg};">
        Butuh bantuan? <a href="${escapeHtml(input.helpUrl)}" style="color:${EMAIL_COLORS.accent};text-decoration:underline;">Buka pusat bantuan</a>.<br>
        Email ini dikirim otomatis karena ada aktivitas pada pesananmu.
        <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${EMAIL_COLORS.mutedFg};text-decoration:underline;">Berhenti menerima email transaksi</a>.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * Versi teks biasa. Wajib ada: sebagian klien menampilkan teks saja, dan email
 * tanpa versi teks lebih mudah dianggap spam.
 */
export function renderEmailText(input: EmailLayoutInput): string {
  const lines: string[] = [];
  lines.push("Ebrystore");
  lines.push("");
  if (input.statusLabel) lines.push(`[${input.statusLabel}]`);
  lines.push(input.heading);
  lines.push("");
  lines.push(input.intro);
  if (input.details?.length) {
    lines.push("");
    for (const row of input.details) lines.push(`${row.label}: ${row.value}`);
  }
  if (input.action) {
    lines.push("");
    lines.push(`${input.action.label}: ${input.action.url}`);
  }
  if (input.note) {
    lines.push("");
    lines.push(input.note);
  }
  lines.push("");
  lines.push(`Bantuan: ${input.helpUrl}`);
  lines.push(`Berhenti menerima email transaksi: ${input.unsubscribeUrl}`);
  return lines.join("\n");
}
