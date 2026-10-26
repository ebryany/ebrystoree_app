type MatchState = { status: string; globalNotFound?: boolean; _notFound?: boolean };

export function routeFailureHead(
  matches: MatchState[],
  missingTitle = "Halaman tidak ditemukan | Ebrystore",
) {
  // Router >= 1.171 marks a global not-found on a successful match via
  // `_notFound`; older versions used `status: "notFound"`. Handle both.
  const missing = matches.some(
    (match) => match.status === "notFound" || match._notFound || match.globalNotFound,
  );
  const failed = matches.some((match) => match.status === "error");
  if (!missing && !failed) return undefined;
  return {
    meta: [
      { title: failed ? "Halaman belum dapat dimuat | Ebrystore" : missingTitle },
      { name: "robots", content: "noindex" },
    ],
  };
}

export function RouteError({
  message = "Halaman belum dapat dimuat. Muat ulang halaman atau kembali ke beranda.",
  href = "/",
  linkLabel = "Kembali ke beranda",
}: {
  message?: string;
  href?: "/" | "/produk" | "/layanan" | "/artikel";
  linkLabel?: string;
}) {
  return (
    <main
      lang="id"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground"
    >
      <div className="w-full max-w-md text-center">
        <div role="alert">
          <h1 className="text-xl font-semibold tracking-tight">Halaman belum dapat dimuat</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Muat ulang halaman
          </button>
          <a
            href={href}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-foreground bg-background px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            {linkLabel}
          </a>
        </div>
      </div>
    </main>
  );
}
