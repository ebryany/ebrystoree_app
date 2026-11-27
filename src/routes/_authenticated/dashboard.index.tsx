import { createFileRoute } from "@tanstack/react-router";

import { ThreadsFeedView } from "@/components/threads/threads-feed";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Threads Komunitas | Ebrystore" },
      {
        name: "description",
        content:
          "Beranda komunitas Ebrystore bergaya Threads: diskusi, ulasan produk digital, jasa seller, dan chat langsung dalam satu tempat.",
      },
      { property: "og:title", content: "Threads Komunitas | Ebrystore" },
      {
        property: "og:description",
        content: "Ikuti kreator dan toko, bagikan utas, dan belanja langsung di Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardThreadsHome,
});

function DashboardThreadsHome() {
  return <ThreadsFeedView />;
}
