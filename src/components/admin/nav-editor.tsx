import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NAV_LOCATIONS, PROTECTED_NAV_URLS, isSafeUrl, type NavItem, type NavLocation } from "@/lib/website-settings";

const INTERNAL_ROUTES = [
  "/",
  "/produk",
  "/layanan",
  "/artikel",
  "/bantuan",
  "/dashboard",
  "/auth",
  "/syarat-ketentuan",
  "/kebijakan-privasi",
  "/kebijakan-refund",
];

export function NavEditor({
  items,
  onChange,
  disabled,
}: {
  items: NavItem[];
  onChange: (next: NavItem[]) => void;
  disabled?: boolean;
}) {
  const [location, setLocation] = useState<NavLocation>("header");
  const scoped = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.location === location)
    .sort((a, b) => a.item.sort_order - b.item.sort_order);

  function patch(index: number, next: Partial<NavItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...next } : item)));
  }

  function move(position: number, delta: number) {
    const target = scoped[position + delta];
    const current = scoped[position];
    if (!target || !current) return;
    onChange(
      items.map((item, i) => {
        if (i === current.index) return { ...item, sort_order: target.item.sort_order };
        if (i === target.index) return { ...item, sort_order: current.item.sort_order };
        return item;
      }),
    );
  }

  function add() {
    const maxOrder = scoped.reduce((acc, s) => Math.max(acc, s.item.sort_order), 0);
    onChange([
      ...items,
      {
        label: "Menu baru",
        url: "/",
        location,
        sort_order: maxOrder + 1,
        is_active: true,
        open_in_new_tab: false,
        required_auth_state: "any",
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lokasi navigasi">
        {NAV_LOCATIONS.map((loc) => (
          <button
            key={loc.value}
            type="button"
            role="tab"
            aria-selected={location === loc.value}
            onClick={() => setLocation(loc.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              location === loc.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {loc.label}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {scoped.map(({ item, index }, position) => {
          const protectedItem = PROTECTED_NAV_URLS.includes(item.url);
          const urlInvalid = !isSafeUrl(item.url);
          const unknownRoute =
            item.url.startsWith("/") && !INTERNAL_ROUTES.some((r) => item.url === r || item.url.startsWith(`${r}/`)) && !item.url.startsWith("/#");
          return (
            <li key={`${item.location}-${index}`} className="rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`nav-label-${index}`}>Label</Label>
                  <Input
                    id={`nav-label-${index}`}
                    value={item.label}
                    disabled={disabled}
                    onChange={(e) => patch(index, { label: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`nav-url-${index}`}>URL</Label>
                  <Input
                    id={`nav-url-${index}`}
                    value={item.url}
                    disabled={disabled || protectedItem}
                    aria-invalid={urlInvalid}
                    aria-describedby={urlInvalid || unknownRoute ? `nav-url-help-${index}` : undefined}
                    onChange={(e) => patch(index, { url: e.target.value })}
                  />
                  {urlInvalid ? (
                    <p id={`nav-url-help-${index}`} className="mt-1 text-xs text-destructive">
                      URL tidak aman atau kosong.
                    </p>
                  ) : unknownRoute ? (
                    <p id={`nav-url-help-${index}`} className="mt-1 text-xs text-amber-600">
                      Route ini belum dikenal aplikasi — periksa sebelum diaktifkan.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={item.is_active}
                    disabled={disabled || protectedItem}
                    onCheckedChange={(v) => patch(index, { is_active: v })}
                    aria-label={`Aktifkan ${item.label}`}
                  />
                  <span>Aktif</span>
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={item.open_in_new_tab}
                    disabled={disabled}
                    onCheckedChange={(v) => patch(index, { open_in_new_tab: v })}
                    aria-label={`Buka ${item.label} di tab baru`}
                  />
                  <span>Tab baru</span>
                </label>
                <Select
                  value={item.required_auth_state}
                  disabled={disabled}
                  onValueChange={(v) => patch(index, { required_auth_state: v as NavItem["required_auth_state"] })}
                >
                  <SelectTrigger className="h-9 w-full sm:w-44" aria-label={`Status login untuk ${item.label}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Semua pengunjung</SelectItem>
                    <SelectItem value="guest">Hanya tamu</SelectItem>
                    <SelectItem value="authenticated">Hanya login</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled || position === 0}
                    onClick={() => move(position, -1)}
                    aria-label={`Naikkan ${item.label}`}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled || position === scoped.length - 1}
                    onClick={() => move(position, 1)}
                    aria-label={`Turunkan ${item.label}`}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled || protectedItem}
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                    aria-label={`Hapus ${item.label}`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {protectedItem ? (
                <p className="mt-2 text-xs text-muted-foreground">Link legal wajib — tidak dapat dihapus atau dinonaktifkan.</p>
              ) : null}
            </li>
          );
        })}
        {scoped.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Belum ada item pada lokasi ini.
          </li>
        ) : null}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
        <Plus className="mr-1 size-4" /> Tambah item
      </Button>
    </div>
  );
}