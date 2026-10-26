import { createFileRoute } from "@tanstack/react-router";

import { ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { PoThread } from "@/components/po/po-thread";

export const Route = createFileRoute("/_authenticated/admin/po/$id")({
  head: () => ({
    meta: [
      { title: "Detail PO Custom — Admin Ebrystore" },
      { name: "description", content: "Kelola penawaran, verifikasi pembayaran, dan kirim hasil permintaan custom." },
      { property: "og:title", content: "Detail PO Custom — Admin Ebrystore" },
      { property: "og:description", content: "Panel tim untuk permintaan produk custom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPoDetail,
});

function AdminPoDetail() {
  const { id } = Route.useParams();
  const canView = useCan("orders.view");
  if (!canView) return <ForbiddenState permission="orders.view" />;
  return <PoThread id={id} mode="staff" />;
}
