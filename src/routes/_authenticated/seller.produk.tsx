import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout untuk keluarga rute /seller/produk/* (index = daftar; baru = form;
 * $id = edit). TanStack men-nesting seller.produk.baru & seller.produk.$id
 * di bawah file ini — tanpa <Outlet/> konten anak tidak pernah dirender
 * (lihat docs/ui/02-analisis-bug-produk-baru-diam.md).
 */
export const Route = createFileRoute("/_authenticated/seller/produk")({
  component: () => <Outlet />,
});
