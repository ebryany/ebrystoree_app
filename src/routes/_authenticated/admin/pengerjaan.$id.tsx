import { createFileRoute } from "@tanstack/react-router";

import { FulfillmentDetail } from "@/components/fulfillment/workspace";

export const Route = createFileRoute("/_authenticated/admin/pengerjaan/$id")({
  head: () => ({
    meta: [
      { title: "Detail Pengerjaan — Admin Ebrystore" },
      { name: "description", content: "Terima tugas, catat progres, dan kirim hasil pengerjaan jasa akademik." },
      { property: "og:title", content: "Detail Pengerjaan — Admin Ebrystore" },
      { property: "og:description", content: "Timeline pengerjaan realtime satu order jasa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetailRoute,
});

function DetailRoute() {
  const { id } = Route.useParams();
  return <FulfillmentDetail base="admin" orderId={id} />;
}
