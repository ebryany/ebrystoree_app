import { cn } from "@/lib/utils";

/** Titik hijau di pojok kanan bawah avatar; induk harus `relative`. */
export function OnlineDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-success ring-2 ring-card sm:size-4",
        className,
      )}
    />
  );
}

export function OnlineLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold text-success",
        className,
      )}
    >
      <span aria-hidden="true" className="size-2 rounded-full bg-success" />
      Online
    </span>
  );
}
