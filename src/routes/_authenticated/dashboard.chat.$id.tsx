import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { InquiryThread } from "@/components/inquiry/inquiry-thread";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/dashboard/chat">
          <ArrowLeft className="size-4" aria-hidden="true" /> Semua chat
        </Link>
      </Button>
      <InquiryThread id={id} mode="customer" />
    </div>
  );
}
