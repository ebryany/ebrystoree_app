import { createFileRoute } from "@tanstack/react-router";

import { FulfillmentBoard } from "@/components/fulfillment/workspace";

export const Route = createFileRoute("/_authenticated/operator/")({
  head: () => ({
    meta: [
      { title: "Tugas Operator — Ebrystore" },
      { name: "description", content: "Daftar order jasa yang ditugaskan kepada Anda beserta progres dan deadline." },
      { property: "og:title", content: "Tugas Operator — Ebrystore" },
      { property: "og:description", content: "Kelola tugas pengerjaan jasa Ebrystore secara realtime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <FulfillmentBoard base="operator" />,
});
