import { createFileRoute } from "@tanstack/react-router";

import { PoThread } from "@/components/po/po-thread";

export const Route = createFileRoute("/_authenticated/dashboard/po/$id")({
  head: () => ({
    meta: [
      { title: "Diskusi PO — Ebrystore" },
      { name: "description", content: "Diskusi permintaan produk custom, penawaran, DP, dan pelunasan." },
      { property: "og:title", content: "Diskusi PO — Ebrystore" },
      { property: "og:description", content: "Pantau status permintaan custom Anda di Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PoDetailPage,
});

function PoDetailPage() {
  const { id } = Route.useParams();
  return <PoThread id={id} mode="customer" />;
}
