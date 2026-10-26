import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { BannerSlider } from "@/components/home/banner-slider";
import { navFor, type NavItem } from "@/lib/website-settings";

export function SettingsPreview({ values }: { values: Record<string, any> }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const nav = (values.site_nav_items ?? []) as NavItem[];
  const header = navFor(nav, "header").filter((i) => i.is_active);
  const legal = navFor(nav, "footer_legal").filter((i) => i.is_active);
  const accent = String(values.site_accent_color ?? "#0f8f86");
  const bg = String(values.site_background_color ?? "#ffffff");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">Pratinjau</p>
        <div className="flex gap-1">
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              aria-label={d === "desktop" ? "Pratinjau desktop" : "Pratinjau mobile"}
              className={`rounded-md border p-1.5 ${device === d ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {d === "desktop" ? <Monitor className="size-4" /> : <Smartphone className="size-4" />}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`mx-auto overflow-hidden rounded-lg border border-border ${device === "mobile" ? "max-w-[320px]" : "w-full"}`}
      >
        <div
          className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
          style={{ background: bg }}
        >
          <div className="flex items-center gap-2">
            {values.site_logo_url ? (
              <img src={String(values.site_logo_url)} alt="" className="h-6 w-auto" />
            ) : (
              <span
                className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
                style={{ background: accent }}
              >
                {String(values.site_brand_short ?? "Ebry")}
              </span>
            )}
            <span className="text-xs font-semibold text-neutral-900">
              {String(values.store_name ?? "")}
            </span>
          </div>
          {device === "desktop" ? (
            <nav className="flex gap-3 text-[11px] text-neutral-600">
              {header.slice(0, 5).map((i) => (
                <span key={i.url + i.label}>{i.label}</span>
              ))}
            </nav>
          ) : (
            <span className="text-[11px] text-neutral-500">Menu</span>
          )}
        </div>
        <div className="space-y-2 px-3 py-4" style={{ background: bg }}>
          <p className="text-sm font-bold text-neutral-900">{String(values.site_tagline ?? "")}</p>
          <p className="text-[11px] leading-relaxed text-neutral-600">
            {String(values.site_description ?? "")}
          </p>
          <span
            className="inline-block rounded-md px-3 py-1 text-[11px] font-semibold text-white"
            style={{ background: accent }}
          >
            {String(values.site_help_cta_label ?? "Hubungi kami")}
          </span>
        </div>
        <div className="border-t border-border px-3 py-2 text-[10px] text-neutral-500">
          {legal.map((i) => i.label).join(" · ") || "—"}
        </div>
      </div>

      <div className={`mx-auto mt-3 ${device === "mobile" ? "max-w-[320px]" : "w-full"}`}>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Banner slider home (draf)</p>
        <BannerSlider settings={values} mobilePreview={device === "mobile"} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Pratinjau memakai nilai draf, termasuk yang belum disimpan.
      </p>
    </div>
  );
}
