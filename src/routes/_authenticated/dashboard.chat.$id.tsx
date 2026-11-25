import { createFileRoute } from "@tanstack/react-router";

import { ChatSplit } from "@/components/chat/chat-split";
import { InquiryThread } from "@/components/inquiry/inquiry-thread";

export const Route = createFileRoute("/_authenticated/dashboard/chat/$id")({
  head: () => ({
    meta: [
      { title: "Diskusi Chat | Ebrystore" },
      {
        name: "description",
        content: "Diskusi ketersediaan produk digital dan jasa langsung bersama toko di Ebrystore.",
      },
      { property: "og:title", content: "Diskusi Chat | Ebrystore" },
      { property: "og:description", content: "Percakapan langsung dengan toko di Ebrystore." },
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
      <InquiryThread key={id} id={id} mode="customer" embedded />
    </ChatSplit>
  );
}
