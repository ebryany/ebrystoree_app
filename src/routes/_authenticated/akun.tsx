import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/akun")({
  head: () => ({
    meta: [
      { title: "Akun Saya — Ebrystore" },
      {
        name: "description",
        content: "Kelola akun Ebrystore, lihat riwayat pesanan, dan akses produk digital yang sudah dibeli.",
      },
      { property: "og:title", content: "Akun Saya — Ebrystore" },
      { property: "og:description", content: "Pusat akun dan pesanan Ebrystore." },
    ],
  }),
  component: HalamanAkun,
});

function HalamanAkun() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/dashboard", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Memindahkan ke dashboard…
    </div>
  );
}
