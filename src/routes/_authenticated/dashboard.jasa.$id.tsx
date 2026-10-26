import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceServiceOrderDetail } from "@/components/ebry/marketplace-service-order";

export const Route = createFileRoute("/_authenticated/dashboard/jasa/$id")({
  head: () => ({
    meta: [{ title: "Detail Pesanan Jasa | Ebrystore" }, { name: "robots", content: "noindex" }],
  }),
  component: ServiceOrderDetailPage,
});

function ServiceOrderDetailPage() {
  const { id } = Route.useParams();
  return <MarketplaceServiceOrderDetail orderId={id} />;
}
