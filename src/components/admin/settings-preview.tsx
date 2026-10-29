import { Monitor, Smartphone } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { BannerSlider } from "@/components/home/banner-slider";
import { navFor, type NavItem } from "@/lib/website-settings";

/** Lebar viewport nyata yang disimulasikan; konten tidak dipaksa reflow ke lebar panel. */
const VIEWPORT = { desktop: 1280, mobile: 390 } as const;

/**
 * Merender anak pada lebar viewport tetap lalu memperkecilnya secara visual agar
 * muat di kontainer. Tanpa ini, layout desktop dipaksa ke lebar panel sempit dan
 * teks pecah per huruf.
 */
function ScaledViewport({ width, children }: { width: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const next = Math.min(1, outer.clientWidth / width);
      setScale(next);
      setHeight(inner.offsetHeight * next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={outerRef} className="w-full overflow-hidden" style={{ height: height || undefined }}>
      <div
        ref={innerRef}
        className="mx-auto origin-top-left"
        style={{ width, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export function SettingsPreview({ values }: { values: Record<string, any> }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const nav = (values.site_nav_items ?? []) as NavItem[];
  const header = navFor(nav, "header").filter((i) => i.is_active);
  const legal = navFor(nav, "footer_legal").filter((i) => i.is_active);
  const accent = String(values.site_accent_color ?? "#0f8f86");
  const bg = String(values.site_background_color ?? "#ffffff");
  const mobile = device === "mobile";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Memakai nilai draf, termasuk yang belum disimpan. Tidak mengubah data tersimpan.
        </p>
        <div className="flex gap-1" role="group" aria-label="Ukuran pratinjau">
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                device === d
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === "desktop" ? (
                <Monitor className="size-4" aria-hidden="true" />
              ) : (
                <Smartphone className="size-4" aria-hidden="true" />
              )}
              {d === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className={mobile ? "mx-auto max-w-[390px]" : undefined}>
          <ScaledViewport key={device} width={VIEWPORT[device]}>
            <div className="overflow-hidden rounded-md border border-border" style={{ background: bg }}>
              <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  {values.site_logo_url ? (
                    <img src={String(values.site_logo_url)} alt="" className="h-8 w-auto" />
                  ) : (
                    <span
                      className="rounded-md px-2.5 py-1 text-sm font-bold text-white"
                      style={{ background: accent }}
                    >
                      {String(values.site_brand_short ?? "Ebry")}
                    </span>
                  )}
                  <span className="truncate text-base font-semibold text-neutral-900">
                    {String(values.store_name ?? "")}
                  </span>
                </div>
                {mobile ? (
                  <span className="text-sm text-neutral-500">Menu</span>
                ) : (
                  <nav className="flex shrink-0 gap-6 whitespace-nowrap text-sm text-neutral-600">
                    {header.slice(0, 6).map((i) => (
                      <span key={i.url + i.label}>{i.label}</span>
                    ))}
                  </nav>
                )}
              </div>

              <div className={mobile ? "space-y-4 px-4 py-6" : "space-y-6 px-6 py-8"}>
                <BannerSlider settings={values} mobilePreview={mobile} />
                <div className="space-y-3">
                  <p className={`font-bold text-neutral-900 ${mobile ? "text-xl" : "text-3xl"}`}>
                    {String(values.site_tagline ?? "")}
                  </p>
                  <p className="max-w-2xl text-sm leading-relaxed text-neutral-600">
                    {String(values.site_description ?? "")}
                  </p>
                  <span
                    className="inline-block rounded-md px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: accent }}
                  >
                    {String(values.site_help_cta_label ?? "Hubungi kami")}
                  </span>
                </div>
              </div>

              <div className="border-t border-neutral-200 px-6 py-4 text-xs text-neutral-500">
                {legal.map((i) => i.label).join(" · ") || "—"}
              </div>
            </div>
          </ScaledViewport>
        </div>
      </div>
    </div>
  );
}
