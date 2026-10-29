import { createFileRoute } from "@tanstack/react-router";

import { ChatSplit } from "@/components/chat/chat-split";
import { InquiryThread } from "@/components/inquiry/inquiry-thread";

export const Route = createFileRoute("/_authenticated/dashboard/chat/$id")({
  head: () => ({
    meta: [
      { title: "Diskusi Produk — Ebrystore" },
      { name: "description", content: "Diskusi ketersediaan dan detail produk digital bersama tim Ebrystore." },
      { property: "og:title", content: "Diskusi Produk — Ebrystore" },
      { property: "og:description", content: "Percakapan tanya produk dengan tim Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatDetailPage,
});

function ChatDetailPage() {
  const { id } = Route.useParams();
  return (
    <ChatSplit mode="customer" activeId={id}>
      <InquiryThread id={id} mode="customer" embedded />
    </ChatSplit>
  );
}
