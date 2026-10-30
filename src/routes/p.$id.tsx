import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { getProductSlugById } from "@/lib/social.functions";

/** Tautan pendek produk berdasarkan id (dipakai notifikasi "produk baru"). */
export const Route = createFileRoute("/p/$id")({
  loader: async ({ params }) => {
    if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw notFound();
    const { slug } = await getProductSlugById({ data: { id: params.id } });
    if (!slug) throw notFound();
    throw redirect({ to: "/produk/$slug", params: { slug }, replace: true });
  },
});
