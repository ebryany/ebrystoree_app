import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { InquiryThread } from "@/components/inquiry/inquiry-thread";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/seller/chat">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Kembali ke daftar chat
        </Link>
      </Button>
      <InquiryThread id={id} mode="seller" />
    </div>
  );
}
