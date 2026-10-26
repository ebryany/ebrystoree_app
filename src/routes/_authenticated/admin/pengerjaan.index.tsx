import { createFileRoute } from "@tanstack/react-router";

import { FulfillmentBoard } from "@/components/fulfillment/workspace";

export const Route = createFileRoute("/_authenticated/admin/pengerjaan/")({
  head: () => ({
    meta: [
      { title: "Pengerjaan Jasa — Admin Ebrystore" },
      {
        name: "description",
        content:
          "Layanan platform: kelola tugas pengerjaan jasa akademik yang dijalankan operator Ebrystore.",
      },
      { property: "og:title", content: "Pengerjaan Jasa — Admin Ebrystore" },
      {
        property: "og:description",
        content: "Progres, revisi, dan hasil pengerjaan jasa secara realtime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FulfillmentBoard base="admin" />,
});
