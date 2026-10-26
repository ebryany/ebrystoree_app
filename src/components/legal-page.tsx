import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageShell } from "@/components/page-shell";

export const DOC_UPDATED_AT = "28 Juli 2026";

export function DocPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Kembali ke beranda
        </Link>
        <h1 className="mt-5 text-3xl font-bold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{intro}</p>
        <p className="mt-2 text-xs text-muted-foreground">Diperbarui: {DOC_UPDATED_AT}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </div>
    </PageShell>
  );
}

export function DocSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

export function OwnerReview({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
      <span className="font-mono font-semibold">OWNER_REVIEW_REQUIRED</span> — {children}
    </p>
  );
}