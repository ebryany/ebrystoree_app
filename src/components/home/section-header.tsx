import type { ReactNode } from "react";

/** Judul section beranda: judul besar + deskripsi singkat, aksi di kanan. */
export function SectionHeader({
  id,
  title,
  desc,
  action,
}: {
  id: string;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2
          id={id}
          className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl"
        >
          {title}
        </h2>
        {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
