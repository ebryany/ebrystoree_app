import { useEffect } from "react";
import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";

import { SecurityErrorView } from "@/components/security-error-page";
import { getCachedSession, useSession } from "@/hooks/use-session";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const session = await getCachedSession();
    // Jangan redirect pengunjung tanpa sesi di /admin ke /as/feb/auth/admin atau /auth
    // agar URL portal admin tidak pernah bocor ke publik/pemindai.
    if (!session && !isAdminPath(location.pathname)) {
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const adminArea = isAdminPath(pathname);

  useEffect(() => {
    if (!loading && !session && !adminArea) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate, adminArea]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Memeriksa sesi…
      </div>
    );
  }

  if (!session) {
    if (adminArea) {
      return (
        <SecurityErrorView
          variant="card"
          status={403}
          title="Akses ke area admin dibatasi"
          description="Halaman administrasi hanya tersedia bagi akun yang terautentikasi melalui portal khusus admin."
          backTo="/"
          backLabel="Kembali ke beranda"
        />
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Memeriksa sesi…
      </div>
    );
  }

  return <Outlet />;
}