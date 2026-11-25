import type { ReactNode } from "react";

/**
 * Parser aman untuk format teks ala WhatsApp (*tebal*, _miring_, ~coret~, `kode`)
 * dan auto-link URL (http/https), plus sorotan kata pencarian di dalam chat.
 * Mengembalikan node React murni tanpa dangerouslySetInnerHTML sehingga bebas XSS.
 */

const TOKEN_RE =
  /(https?:\/\/[^\s<>()]+|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

const URL_RE = /https?:\/\/[^\s<>()]+/g;

function highlightText(text: string, needle: string, keyPrefix: string): ReactNode {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const q = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(q, start);
  let n = 0;
  while (idx !== -1) {
    if (idx > start) parts.push(text.slice(start, idx));
    parts.push(
      <mark
        key={`${keyPrefix}-h-${n++}`}
        className="rounded-sm bg-warning/40 px-0.5 text-inherit"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    start = idx + q.length;
    idx = lower.indexOf(q, start);
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.length > 0 ? parts : text;
}

export function renderFormattedChatText(text: string, searchNeedle = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const needle = searchNeedle.trim();
  let lastIndex = 0;
  let idx = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    const token = match[0];
    if (start > lastIndex) {
      out.push(highlightText(text.slice(lastIndex, start), needle, `t-${idx++}`));
    }
    if (token.startsWith("http://") || token.startsWith("https://")) {
      const cleanHref = token.replace(/[.,!?;:]+$/, "");
      const trailing = token.slice(cleanHref.length);
      out.push(
        <a
          key={`u-${idx++}`}
          href={cleanHref}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all underline decoration-current/60 underline-offset-2 hover:opacity-80"
        >
          {highlightText(cleanHref, needle, `ul-${idx}`)}
        </a>,
      );
      if (trailing) out.push(trailing);
    } else if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      out.push(
        <code
          key={`c-${idx++}`}
          className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.88em]"
        >
          {highlightText(token.slice(1, -1), needle, `cl-${idx}`)}
        </code>,
      );
    } else if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      out.push(
        <strong key={`b-${idx++}`} className="font-semibold">
          {highlightText(token.slice(1, -1), needle, `bl-${idx}`)}
        </strong>,
      );
    } else if (token.startsWith("_") && token.endsWith("_") && token.length > 2) {
      out.push(
        <em key={`i-${idx++}`}>{highlightText(token.slice(1, -1), needle, `il-${idx}`)}</em>,
      );
    } else if (token.startsWith("~") && token.endsWith("~") && token.length > 2) {
      out.push(
        <s key={`s-${idx++}`}>{highlightText(token.slice(1, -1), needle, `sl-${idx}`)}</s>,
      );
    } else {
      out.push(highlightText(token, needle, `f-${idx++}`));
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) {
    out.push(highlightText(text.slice(lastIndex), needle, `e-${idx++}`));
  }
  return out;
}

/** Ekstrak semua URL unik dari daftar pesan untuk tab "Tautan" di panel Media. */
export function extractChatUrls(messages: Array<{ id: string; body: string; created_at: string }>) {
  const seen = new Set<string>();
  const links: Array<{ url: string; messageId: string; createdAt: string }> = [];
  for (const msg of messages) {
    if (!msg.body) continue;
    for (const match of msg.body.matchAll(URL_RE)) {
      const clean = match[0].replace(/[.,!?;:]+$/, "");
      if (!seen.has(clean)) {
        seen.add(clean);
        links.push({ url: clean, messageId: msg.id, createdAt: msg.created_at });
      }
    }
  }
  return links;
}

const OFF_PLATFORM_PATTERNS: RegExp[] = [
  /\b(?:wa\.me|chat\.whatsapp\.com|t\.me\/)\b/i,
  /\b(?:transfer|tf|bayar|transaksi)\s+(?:langsung|di\s*luar|pribadi|via\s*wa)\b/i,
  /\b(?:rekening\s+pribadi|norek\s+pribadi|chat\s+di\s+wa|lanjut\s+wa|hubungi\s+wa)\b/i,
  /(?:\+62|08)\d{8,12}/,
];

/**
 * Deteksi sinyal ajakan transaksi di luar platform (anti-phishing / anti-escrow bypass).
 * Bersifat edukatif dan non-blocking agar diskusi sah tidak terhenti, namun pembeli
 * langsung mendapat pengingat keamanan yang jelas.
 */
export function detectOffPlatformRisk(text: string): boolean {
  if (!text || text.length < 6) return false;
  return OFF_PLATFORM_PATTERNS.some((re) => re.test(text));
}

export type QuickReplyTemplate = {
  command: string;
  label: string;
  body: string;
};

export const SELLER_QUICK_REPLIES: QuickReplyTemplate[] = [
  {
    command: "/halo",
    label: "Sambutan ramah",
    body: "Halo! Terima kasih sudah menghubungi toko kami. Ada yang bisa kami bantu?",
  },
  {
    command: "/ready",
    label: "Stok tersedia",
    body: "Produk ini tersedia dan bisa langsung dipesan lewat checkout Ebrystore ya.",
  },
  {
    command: "/proses",
    label: "Sedang diproses",
    body: "Pesanan Anda sudah kami terima dan sedang diproses. Hasil akan dikirim lewat halaman pesanan.",
  },
  {
    command: "/revisi",
    label: "Konfirmasi revisi",
    body: "Baik, catatan revisinya sudah kami terima. Mohon tunggu pembaruan hasilnya ya.",
  },
  {
    command: "/garansi",
    label: "Info garansi & akses",
    body: "Akses dan garansi mengikuti deskripsi produk resmi di halaman Ebrystore.",
  },
];

export const BUYER_QUICK_REPLIES: QuickReplyTemplate[] = [
  {
    command: "/ready",
    label: "Tanya ketersediaan",
    body: "Halo, apakah produk/jasa ini masih tersedia hari ini?",
  },
  {
    command: "/cek",
    label: "Tanya estimasi",
    body: "Boleh info estimasi pengerjaan atau cara aktivasinya kak?",
  },
  {
    command: "/brief",
    label: "Diskusi kebutuhan",
    body: "Saya mau diskusi dulu mengenai kebutuhan saya sebelum melakukan pemesanan.",
  },
];

export function matchQuickReplies(
  draft: string,
  role: "customer" | "seller" | "staff",
): QuickReplyTemplate[] {
  if (!draft.startsWith("/")) return [];
  const q = draft.trim().toLowerCase();
  const list = role === "customer" ? BUYER_QUICK_REPLIES : SELLER_QUICK_REPLIES;
  return list.filter(
    (item) => item.command.startsWith(q) || item.label.toLowerCase().includes(q.slice(1)),
  );
}
