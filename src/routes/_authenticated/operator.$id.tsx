import { createFileRoute } from "@tanstack/react-router";

import { FulfillmentDetail } from "@/components/fulfillment/workspace";

export const Route = createFileRoute("/_authenticated/operator/$id")({
  head: () => ({
    meta: [
      { title: "Detail Tugas Operator — Ebrystore" },
      { name: "description", content: "Kelola pengerjaan satu order jasa: terima tugas, catat progres, kirim hasil." },
      { property: "og:title", content: "Detail Tugas Operator — Ebrystore" },
      { property: "og:description", content: "Pengerjaan order jasa Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetailRoute,
});

function DetailRoute() {
  const { id } = Route.useParams();
  return <FulfillmentDetail base="operator" orderId={id} />;
}
