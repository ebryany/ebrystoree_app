import { Link } from "@tanstack/react-router";

import { useSession } from "@/hooks/use-session";
import { useSiteNav, useWebsiteSettings } from "@/hooks/use-website-settings";
import type { NavLocation } from "@/lib/website-settings";

function FooterNav({ label, location }: { label: string; location: NavLocation }) {
  const { user } = useSession();
  const items = useSiteNav(location, Boolean(user));
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="min-w-0 text-sm">
      <h2 className="font-semibold">{label}</h2>
      <ul className="mt-2 text-muted-foreground">
        {items.map((item) => (
          <li key={`${item.url}-${item.label}`}>
            <Link
              to={item.url as string}
              target={item.open_in_new_tab ? "_blank" : undefined}
              rel={item.open_in_new_tab ? "noopener noreferrer" : undefined}
              className="flex min-h-11 w-fit min-w-11 max-w-full items-center rounded-md py-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="break-words">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const settings = useWebsiteSettings();
  return (
    <footer className="pb-safe border-t border-border bg-card">
      <div className="mx-auto grid w-full gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12 lg:px-8 lg:py-10">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-md text-lg font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {String(settings.store_name ?? "Ebrystore")}
          </Link>
          {settings.site_description ? (
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {String(settings.site_description)}
            </p>
          ) : null}
          {settings.site_support_email ? (
            <a
              className="mt-2 flex min-h-11 w-fit max-w-full items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={`mailto:${settings.site_support_email}`}
            >
              <span className="break-all">{String(settings.site_support_email)}</span>
            </a>
          ) : null}
          {settings.site_whatsapp ? (
            <p className="mt-1 break-words text-sm text-muted-foreground">
              WhatsApp {String(settings.site_whatsapp)}
            </p>
          ) : null}
          {settings.site_operating_hours ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {String(settings.site_operating_hours)}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <FooterNav label="Produk" location="footer_product" />
          <FooterNav label="Layanan" location="footer_service" />
          <FooterNav label="Akun & bantuan" location="footer_help" />
          <FooterNav label="Kebijakan" location="footer_legal" />
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs leading-relaxed text-muted-foreground sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {String(settings.site_business_name ?? "Ebrystore")}
          </p>
          <p className="max-w-lg">Periksa detail produk dan ketentuan layanan sebelum memesan.</p>
        </div>
      </div>
    </footer>
  );
}
