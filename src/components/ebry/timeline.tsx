import { Check, Circle, Dot } from "lucide-react";

import { cn } from "@/lib/utils";

export type TimelineStep = {
  key: string;
  label: string;
  description?: string;
  timestamp?: string | null;
  state: "done" | "current" | "upcoming";
};

export function ProgressTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? (
              <span
                className={cn(
                  "absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 rounded-full",
                  step.state === "done" ? "bg-accent" : "bg-border",
                )}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={cn(
                "z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors",
                step.state === "done"
                  ? "border-accent bg-accent text-accent-foreground"
                  : step.state === "current"
                    ? "border-accent bg-background text-accent"
                    : "border-border bg-background text-muted-foreground",
              )}
            >
              {step.state === "done" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : step.state === "current" ? (
                <Dot className="size-6" aria-hidden="true" />
              ) : (
                <Circle className="size-2.5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {step.label}
                {step.state === "current" ? <span className="sr-only"> (status saat ini)</span> : null}
              </p>
              {step.description ? <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p> : null}
              {step.timestamp ? (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {new Date(step.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}