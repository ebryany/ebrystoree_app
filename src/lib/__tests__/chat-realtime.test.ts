import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { chatDayLabel, shortChatTime } from "@/components/chat/chat-time";

const sql = readFileSync("supabase/migrations/20261003130000_chat_read_state.sql", "utf8");
const inquiries = readFileSync("src/lib/inquiries.functions.ts", "utf8");
const thread = readFileSync("src/components/inquiry/inquiry-thread.tsx", "utf8");
const windowSrc = readFileSync("src/components/chat/chat-window.tsx", "utf8");
const typing = readFileSync("src/hooks/use-chat-typing.ts", "utf8");

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
  it("marks read via RPC and refreshes thread meta", () => {
    expect(thread).toContain("markRead({ data: { inquiryId: id } })");
    expect(thread).toContain('document.visibilityState !== "visible"');
    expect(thread).toContain("keys: [queryKey, messagesKey]");
  });
  it("renders optimistic bubbles with retry and a near-bottom scroll guard", () => {
    expect(windowSrc).toContain('status: "sending" | "failed"');
    expect(windowSrc).toContain("Gagal, coba lagi");
    expect(windowSrc).toContain("NEAR_BOTTOM_PX = 120");
    expect(windowSrc).toContain('role="log"');
    expect(windowSrc).toContain('aria-label="Riwayat pesan"');
    expect(windowSrc).toContain("Pesan baru");
    expect(windowSrc).not.toContain(
      'scrollIntoView({ block: "end", behavior: "smooth" });\n  }, [data?.messages?.length]);',
    );
  });
  it("uses broadcast-only typing with cleanup and no persistence", () => {
    expect(typing).toContain("broadcast: { self: false }");
    expect(typing).toContain('event: "typing"');
    expect(typing).toContain("supabase.removeChannel(ch)");
    expect(typing).not.toMatch(/from\(|\.insert\(|\.update\(/);
  });
  it("list pages surface unread badges and last message preview", () => {
    const buyer = readFileSync("src/routes/_authenticated/dashboard.chat.index.tsx", "utf8");
    const seller = readFileSync("src/routes/_authenticated/seller.chat.index.tsx", "utf8");
    const admin = readFileSync("src/routes/_authenticated/admin/chat.index.tsx", "utf8");
    expect(buyer).toContain("ChatListItemContent");
    expect(buyer).toContain("last_message_body");
    expect(buyer).toContain('"inquiry-unread"');
    expect(seller).toContain("unreadById.get(item.id)");
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
