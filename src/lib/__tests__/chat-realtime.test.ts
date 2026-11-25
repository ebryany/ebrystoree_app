import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  detectOffPlatformRisk,
  extractChatUrls,
  matchQuickReplies,
  renderFormattedChatText,
} from "@/components/chat/chat-format";
import { chatDayLabel, shortChatTime } from "@/components/chat/chat-time";
import {
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsUrl,
  buildOsmEmbedUrl,
  latLngToWorldPixels,
  LocationBubbleCard,
  parseCoordinateOrMapsInput,
  worldPixelsToLatLng,
} from "@/components/chat/location-map";
import { formatAudioClock } from "@/components/chat/voice-note";
import { normalizeChatMime } from "@/lib/inquiries.functions";

const sql = readFileSync("supabase/migrations/20261003130000_chat_read_state.sql", "utf8");
const sqlVn = readFileSync(
  "supabase/migrations/20261125123000_chat_whatsapp_vn_full.sql",
  "utf8",
);
const inquiries = readFileSync("src/lib/inquiries.functions.ts", "utf8");
const thread = readFileSync("src/components/inquiry/inquiry-thread.tsx", "utf8");
const windowSrc = readFileSync("src/components/chat/chat-window.tsx", "utf8");
const typing = readFileSync("src/hooks/use-chat-typing.ts", "utf8");
const serverSrc = readFileSync("src/server.ts", "utf8");

describe("chat time helpers (pure)", () => {
  it("labels today as clock time and yesterday as Kemarin", () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).toISOString();
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      9,
      5,
    ).toISOString();
    expect(shortChatTime(today)).toMatch(/^\d{2}\.\d{2}$/);
    expect(shortChatTime(yesterday)).toBe("Kemarin");
    expect(chatDayLabel(today)).toBe("Hari ini");
    expect(chatDayLabel(yesterday)).toBe("Kemarin");
  });
});

describe("chat formatting, safety detection, VN & quick replies (pure)", () => {
  it("formats *bold*, _italic_, ~strike~, `code` and auto-links safely without XSS", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        renderFormattedChatText(
          "Halo *penting* _miring_ ~lama~ `kode` cek https://app.ebrystore.my.id/produk <script>alert(1)</script>",
        ),
      ),
    );
    expect(html).toContain("<strong");
    expect(html).toContain("penting");
    expect(html).toContain("<em>miring</em>");
    expect(html).toContain("<s>lama</s>");
    expect(html).toContain("<code");
    expect(html).toContain('href="https://app.ebrystore.my.id/produk"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).not.toContain("<script>");
  });

  it("extracts unique URLs across messages for the shared links drawer", () => {
    const urls = extractChatUrls([
      { id: "1", body: "Lihat https://example.com/a.", created_at: "2026-01-01T00:00:00Z" },
      { id: "2", body: "Duplikat https://example.com/a dan https://example.com/b", created_at: "2026-01-01T00:01:00Z" },
    ]);
    expect(urls.map((u) => u.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("detects off-platform solicitation patterns without flagging normal marketplace questions", () => {
    expect(detectOffPlatformRisk("Hubungi wa.me/6281234567890 untuk bayar")).toBe(true);
    expect(detectOffPlatformRisk("Boleh transfer langsung ke rekening pribadi?")).toBe(true);
    expect(detectOffPlatformRisk("Apakah akun ChatGPT Plus ini ready kak?")).toBe(false);
  });

  it("matches slash quick replies for seller and buyer roles", () => {
    expect(matchQuickReplies("/", "seller").length).toBeGreaterThanOrEqual(4);
    expect(matchQuickReplies("/ready", "seller")[0]?.command).toBe("/ready");
    expect(matchQuickReplies("/cek", "customer")[0]?.command).toBe("/cek");
    expect(matchQuickReplies("halo biasa", "seller")).toEqual([]);
  });

  it("normalizes browser MediaRecorder codec MIME strings and formats VN duration", () => {
    expect(normalizeChatMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeChatMime("AUDIO/MP4; codecs=mp4a.40.2")).toBe("audio/mp4");
    expect(formatAudioClock(0)).toBe("0:00");
    expect(formatAudioClock(65)).toBe("1:05");
  });
});

describe("chat read state SQL contract (static, not database execution)", () => {
  it("adds read and preview columns with a safe backfill", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS customer_read_at");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS merchant_read_at");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS last_message_body");
    expect(sql).toContain("DISTINCT ON (inquiry_id)");
    expect(sql).toContain("COALESCE(customer_read_at, now())");
  });
  it("keeps status behavior and fills preview in the touch trigger", () => {
    const trigger = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.touch_product_inquiry"),
      sql.indexOf("-- Pembacaan sisi merchant"),
    );
    expect(trigger).toContain("last_message_body = NEW.body");
    expect(trigger).toContain("last_message_role = NEW.sender_role");
    expect(trigger).toContain("WHEN NEW.sender_role IN ('staff', 'seller') THEN 'answered'");
    expect(trigger).toContain("WHEN status = 'closed' THEN status");
  });
  it("guards mark_inquiry_read per role and revokes public access", () => {
    const rpc = sql.slice(
      sql.indexOf("CREATE FUNCTION public.mark_inquiry_read"),
      sql.indexOf("-- Jumlah pesan belum dibaca"),
    );
    expect(rpc).toContain("v_inquiry.user_id = v_user");
    expect(rpc).toContain("public.my_store_id()");
    expect(rpc).toContain("public.is_staff(v_user)");
    expect(rpc).toContain("RAISE EXCEPTION 'FORBIDDEN'");
    expect(rpc).toContain("FOR UPDATE");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.mark_inquiry_read(uuid) FROM PUBLIC, anon, authenticated",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.unread_inquiry_counts() TO authenticated",
    );
  });
  it("counts unread from the counterparty newer than the viewer read stamp", () => {
    const counts = sql.slice(sql.indexOf("CREATE FUNCTION public.unread_inquiry_counts"));
    expect(counts).toContain("i.user_id = auth.uid()");
    expect(counts).toContain("i.store_id = public.my_store_id()");
    expect(counts).toContain("m.sender_role <> 'customer'");
    expect(counts).toContain("m.created_at > COALESCE(");
  });
});

describe("chat WhatsApp + VN full upgrade SQL & security header contract", () => {
  it("adds reply, reactions, audit-safe edit/soft-delete columns and expands attachment kinds & audio bucket", () => {
    expect(sqlVn).toContain("ADD COLUMN IF NOT EXISTS reply_to_id");
    expect(sqlVn).toContain("ADD COLUMN IF NOT EXISTS reactions");
    expect(sqlVn).toContain("ADD COLUMN IF NOT EXISTS edited_at");
    expect(sqlVn).toContain("ADD COLUMN IF NOT EXISTS deleted_at");
    expect(sqlVn).toContain("ADD COLUMN IF NOT EXISTS original_body");
    expect(sqlVn).toContain("'audio', 'gallery', 'product', 'service'");
    expect(sqlVn).toContain("'audio/webm'");
    expect(sqlVn).toContain("'audio/mp4'");
  });

  it("secures reaction, edit (15m window), soft-delete (audit-preserving), and mark-unread RPCs", () => {
    expect(sqlVn).toContain("CREATE OR REPLACE FUNCTION public.toggle_inquiry_message_reaction");
    expect(sqlVn).toContain("CREATE OR REPLACE FUNCTION public.edit_inquiry_message");
    expect(sqlVn).toContain("interval '15 minutes'");
    expect(sqlVn).toContain("original_body = COALESCE(original_body, body)");
    expect(sqlVn).toContain("CREATE OR REPLACE FUNCTION public.soft_delete_inquiry_message");
    expect(sqlVn).toContain("CREATE OR REPLACE FUNCTION public.mark_inquiry_unread");
    expect(sqlVn).toContain("REVOKE ALL ON FUNCTION public.edit_inquiry_message");
    expect(sqlVn).toContain("REVOKE ALL ON FUNCTION public.soft_delete_inquiry_message");
  });

  it("permits same-origin microphone & scoped media-src for Voice Notes without opening camera", () => {
    expect(serverSrc).toContain("camera=(), microphone=(self)");
    expect(serverSrc).toContain("media-src 'self' blob:");
    expect(serverSrc).toContain("https://www.openstreetmap.org");
    expect(serverSrc).toContain("https://maps.google.com");
  });
});

describe("WhatsApp location map projection, URL parsing, and bubble card render", () => {
  it("projects coordinates accurately through Web Mercator round-trip", () => {
    const jakarta = { lat: -6.175392, lng: 106.827153 };
    const px = latLngToWorldPixels(jakarta.lat, jakarta.lng, 16);
    const back = worldPixelsToLatLng(px.x, px.y, 16);
    expect(Math.abs(back.lat - jakarta.lat)).toBeLessThan(0.00001);
    expect(Math.abs(back.lng - jakarta.lng)).toBeLessThan(0.00001);
  });

  it("parses raw coordinates and Google Maps links cleanly", () => {
    expect(parseCoordinateOrMapsInput("-6.2088, 106.8456")).toEqual({
      lat: -6.2088,
      lng: 106.8456,
    });
    expect(
      parseCoordinateOrMapsInput(
        "https://www.google.com/maps/place/Monas/@-6.175392,106.827153,17z",
      ),
    ).toEqual({ lat: -6.175392, lng: 106.827153 });
    expect(
      parseCoordinateOrMapsInput("https://maps.google.com/?q=-5.147665%2C119.432732"),
    ).toEqual({ lat: -5.147665, lng: 119.432732 });
    expect(parseCoordinateOrMapsInput("Monas Jakarta")).toBeNull();
    expect(parseCoordinateOrMapsInput("999, 999")).toBeNull();
  });

  it("builds valid Google Maps and OSM embed URLs and renders LocationBubbleCard safely", () => {
    expect(buildGoogleMapsUrl(-6.175392, 106.827153)).toContain("-6.175392,106.827153");
    expect(buildGoogleMapsEmbedUrl(-6.175392, 106.827153)).toContain("output=embed");
    expect(buildOsmEmbedUrl(-6.175392, 106.827153)).toContain("marker=-6.175392%2C106.827153");

    const html = renderToStaticMarkup(
      createElement(LocationBubbleCard, {
        lat: -6.175392,
        lng: 106.827153,
        label: "Monumen Nasional",
        address: "Gambir, Jakarta Pusat",
        mine: true,
        onOpenFullMap: () => {},
      }),
    );
    expect(html).toContain("Monumen Nasional");
    expect(html).toContain("Gambir, Jakarta Pusat");
    expect(html).toContain("basemaps.cartocdn.com/rastertiles/voyager/16/");
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("Peta interaktif");
    expect(html).toContain("Google Maps");
    expect(windowSrc).toContain("LocationBubbleCard");
    expect(windowSrc).toContain("LocationPickerDialog");
    expect(windowSrc).toContain("LocationMapModal");
    expect(windowSrc).toContain("touch-pan-y");
    expect(windowSrc).toContain("chat-scroll");
  });
});

describe("chat source contracts (static)", () => {
  it("deduplicates notifications per thread instead of inserting every message", () => {
    expect(inquiries).toContain("async function notifyOnce(");
    expect(inquiries).toContain('.is("read_at", null)');
    expect(inquiries).toContain('.eq("related_type", "product_inquiry")');
    expect(inquiries.match(/from\("notifications"\)\.insert/g)?.length ?? 0).toBe(1);
  });
  it("windows messages to 50 with an explicit load-more page", () => {
    expect(inquiries).toContain("MESSAGE_PAGE_SIZE = 50");
    expect(inquiries).toContain("hasMore = (rawMessages.data?.length ?? 0) > MESSAGE_PAGE_SIZE");
    expect(inquiries).toContain("export const getInquiryMessagesPage");
    expect(inquiries).toContain('.lt("created_at", data.before)');
    expect(inquiries).not.toContain("limit(300)");
  });
  it("marks read via RPC on visibilitychange and refreshes unread badges & thread meta", () => {
    expect(thread).toContain("markRead({ data: { inquiryId: id } })");
    expect(thread).toContain('document.visibilityState !== "visible"');
    expect(thread).toContain('document.addEventListener("visibilitychange"');
    expect(thread).toContain("keys: [queryKey, messagesKey]");
    expect(thread).toContain('queryKey: ["inquiry-unread"]');
  });
  it("renders optimistic bubbles with retry, near-bottom scroll guard, VN, IME safety, and no state leak across threads", () => {
    expect(windowSrc).toContain('status: "sending" | "failed"');
    expect(windowSrc).toContain("Gagal, coba lagi");
    expect(windowSrc).toContain("NEAR_BOTTOM_PX = 120");
    expect(windowSrc).toContain('role="log"');
    expect(windowSrc).toContain('aria-label="Riwayat pesan"');
    expect(windowSrc).toContain("Pesan baru");
    expect(windowSrc).toContain("event.keyCode === 229");
    expect(windowSrc).toContain("VoiceNoteRecorder");
    expect(windowSrc).toContain("VoiceNotePlayer");
    expect(windowSrc).not.toContain(
      'scrollIntoView({ block: "end", behavior: "smooth" });\n  }, [data?.messages?.length]);',
    );
    const buyerDetail = readFileSync("src/routes/_authenticated/dashboard.chat.$id.tsx", "utf8");
    const sellerDetail = readFileSync("src/routes/_authenticated/seller.chat.$id.tsx", "utf8");
    const adminDetail = readFileSync("src/routes/_authenticated/admin/chat.$id.tsx", "utf8");
    expect(buyerDetail).toContain("<InquiryThread key={id}");
    expect(sellerDetail).toContain("<InquiryThread key={id}");
    expect(adminDetail).toContain("<InquiryThread key={id}");
  });
  it("uses broadcast-only typing & recording with cleanup and no persistence", () => {
    expect(typing).toContain("broadcast: { self: false }");
    expect(typing).toContain('event: "typing"');
    expect(typing).toContain("supabase.removeChannel(ch)");
    expect(typing).not.toMatch(/from\(|\.insert\(|\.update\(/);
  });
  it("list pages surface unread badges, last message preview, and no double avatar in seller chat", () => {
    const buyer = readFileSync("src/routes/_authenticated/dashboard.chat.index.tsx", "utf8");
    const seller = readFileSync("src/routes/_authenticated/seller.chat.index.tsx", "utf8");
    const admin = readFileSync("src/routes/_authenticated/admin/chat.index.tsx", "utf8");
    expect(buyer).toContain("ChatListItemContent");
    expect(buyer).toContain("last_message_body");
    expect(buyer).toContain('"inquiry-unread"');
    expect(seller).toContain("unreadById.get(item.id)");
    expect(seller).not.toContain("name.trim().charAt(0)");
    expect(admin).toContain("listInquiryUnreadCounts");
  });
});

describe("realtime publication contract (static SQL, root cause of silent subscriptions)", () => {
  const publication = readFileSync(
    "supabase/migrations/20261003131000_chat_realtime_publication.sql",
    "utf8",
  );
  it("registers chat tables and product catalog into supabase_realtime", () => {
    for (const table of ["product_inquiries", "product_inquiry_messages", "digital_products"]) {
      expect(publication).toContain(`tablename = '${table}'`);
      expect(publication).toContain(`ALTER PUBLICATION supabase_realtime ADD TABLE public.${table};`);
    }
  });
  it("is idempotent via publication membership guards", () => {
    expect(publication).toContain("IF NOT EXISTS (");
    expect(publication).toContain("pg_publication_tables");
    expect(publication.match(/ALTER PUBLICATION supabase_realtime ADD TABLE/g)).toHaveLength(3);
  });
});
