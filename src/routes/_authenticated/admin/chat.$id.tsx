import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ForbiddenState } from "@/components/admin/admin-ui";
import { useCan } from "@/components/admin/admin-ui";
import { InquiryThread } from "@/components/inquiry/inquiry-thread";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin/chat">
          <ArrowLeft className="size-4" aria-hidden="true" /> Semua chat produk
        </Link>
      </Button>
      <InquiryThread id={id} mode="staff" />
    </div>
  );
}
