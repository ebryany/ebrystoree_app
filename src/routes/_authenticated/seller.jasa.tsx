import { createFileRoute } from "@tanstack/react-router";
import { MarketplaceServiceCatalog } from "@/components/seller/marketplace-service-catalog";

export const Route = createFileRoute("/_authenticated/seller/jasa")({
  head: () => ({
    meta: [{ title: "Jasa Toko | Ebrystore" }, { name: "robots", content: "noindex" }],
  }),
  component: MarketplaceServiceCatalog,
});
