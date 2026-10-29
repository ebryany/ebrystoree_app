import { createFileRoute } from "@tanstack/react-router";

import { ChatSplit } from "@/components/chat/chat-split";
import { InquiryThread } from "@/components/inquiry/inquiry-thread";

export const Route = createFileRoute("/_authenticated/seller/chat/$id")({
  head: () => ({
    meta: [
      { title: "Detail Chat — Seller Ebrystore" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerChatDetail,
});

function SellerChatDetail() {
  const { id } = Route.useParams();

  return (
    <ChatSplit mode="seller" activeId={id}>
      <InquiryThread id={id} mode="seller" embedded />
    </ChatSplit>
  );
}
