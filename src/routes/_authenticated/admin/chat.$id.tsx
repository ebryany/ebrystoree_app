import { createFileRoute } from "@tanstack/react-router";

import { ForbiddenState } from "@/components/admin/admin-ui";
import { useCan } from "@/components/admin/admin-ui";
import { ChatSplit } from "@/components/chat/chat-split";
import { InquiryThread } from "@/components/inquiry/inquiry-thread";

export const Route = createFileRoute("/_authenticated/admin/chat/$id")({
  head: () => ({
    meta: [
      { title: "Detail Chat Produk — Admin Ebrystore" },
      { name: "description", content: "Balas pertanyaan pelanggan tentang ketersediaan produk digital." },
      { property: "og:title", content: "Detail Chat Produk — Admin Ebrystore" },
      { property: "og:description", content: "Percakapan tanya produk dengan pelanggan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminChatDetail,
});

function AdminChatDetail() {
  const { id } = Route.useParams();
  const canView = useCan("orders.view");
  if (!canView) return <ForbiddenState />;

  return (
    <ChatSplit mode="staff" activeId={id}>
      <InquiryThread id={id} mode="staff" embedded />
    </ChatSplit>
  );
}
