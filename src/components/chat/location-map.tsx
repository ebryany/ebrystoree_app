import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  Search,
  SendHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { reverseGeocodeLocation, searchLocationPlaces } from "@/lib/inquiries.functions";
import { cn } from "@/lib/utils";

const TILE_SIZE = 256;
const DEFAULT_ZOOM = 16;
const FALLBACK_CENTER = { lat: -6.175392, lng: 106.827153 }; // Monas, Jakarta

export type SharedLocationPayload = {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
};

/** Konversi koordinat (lat, lng) ke piksel dunia Web Mercator pada zoom tertentu. */
export function latLngToWorldPixels(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const clampedLng = Math.max(-180, Math.min(180, lng));
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((clampedLng + 180) / 360) * scale;
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Konversi balik piksel dunia Web Mercator ke koordinat (lat, lng). */
export function worldPixelsToLatLng(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const wrappedX = ((x % scale) + scale) % scale;
  const clampedY = Math.max(0, Math.min(scale, y));
  const lng = (wrappedX / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * clampedY) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Number(Math.max(-85, Math.min(85, lat)).toFixed(6)),
    lng: Number(Math.max(-180, Math.min(180, lng)).toFixed(6)),
  };
}

/**
 * Parsing instan koordinat mentah ("-6.2088, 106.8456") atau tautan Google Maps
 * ("@lat,lng", "?q=lat,lng", "ll=lat,lng") tanpa perlu jaringan.
 */
export function parseCoordinateOrMapsInput(raw: string): { lat: number; lng: number } | null {
  const input = raw.trim();
  if (!input) return null;

  const patterns = [
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|center)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }
  return null;
}

export function buildGoogleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function buildGoogleMapsEmbedUrl(lat: number, lng: number, zoom = 16) {
  return `https://maps.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}&z=${zoom}&hl=id&output=embed`;
}

export function buildOsmEmbedUrl(lat: number, lng: number, delta = 0.005) {
  const minLng = Math.max(-180, lng - delta).toFixed(6);
  const minLat = Math.max(-85, lat - delta * 0.72).toFixed(6);
  const maxLng = Math.min(180, lng + delta).toFixed(6);
  const maxLat = Math.min(85, lat + delta * 0.72).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

function tileUrl(provider: "carto" | "osm", z: number, tx: number, ty: number) {
  const max = 2 ** z;
  const wrappedX = ((tx % max) + max) % max;
  if (ty < 0 || ty >= max) return null;
  if (provider === "carto") {
    const sub = ["a", "b", "c"][Math.abs(wrappedX + ty) % 3] ?? "a";
    return `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${wrappedX}/${ty}@2x.png`;
  }
  return `https://tile.openstreetmap.org/${z}/${wrappedX}/${ty}.png`;
}

function MapTile({ z, tx, ty }: { z: number; tx: number; ty: number }) {
  const [stage, setStage] = useState<"carto" | "osm" | "none">("carto");

  useEffect(() => {
    setStage("carto");
  }, [z, tx, ty]);

  const src = stage === "none" ? null : tileUrl(stage, z, tx, ty);
  if (!src) {
    return (
      <div
        aria-hidden="true"
        className="size-[256px] shrink-0 bg-[#E6ECE5] dark:bg-[#223038]"
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={TILE_SIZE}
      height={TILE_SIZE}
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setStage((s) => (s === "carto" ? "osm" : "none"))}
      className="size-[256px] shrink-0 select-none object-cover"
    />
  );
}

/** Pin merah tetes air khas WhatsApp di tengah pratinjau peta. */
function MapCenterPin({ lifted = false }: { lifted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"
    >
      <span
        className={cn(
          "block transition-transform duration-150 motion-reduce:transition-none",
          lifted && "-translate-y-1.5 scale-105",
        )}
      >
        <svg viewBox="0 0 32 42" className="h-10 w-8 drop-shadow-[0_3px_5px_rgba(0,0,0,0.35)]">
          <path
            d="M16 1C8.27 1 2 7.27 2 15c0 10.5 14 25.5 14 25.5S30 25.5 30 15C30 7.27 23.73 1 16 1z"
            fill="#E53935"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
          <circle cx="16" cy="14.5" r="5" fill="#FFFFFF" />
        </svg>
      </span>
      <span
        className={cn(
          "mx-auto -mt-1 block h-1.5 w-3.5 rounded-full bg-black/30 blur-[1px] transition-transform duration-150",
          lifted && "scale-75 opacity-60",
        )}
      />
    </span>
  );
}

/**
 * Pratinjau peta jalan presisi berbasis tile Web Mercator (tanpa dependency eksternal).
 * - Di bubble chat: instan, ringan, tidak membajak scroll percakapan.
 * - Di picker lokasi: bisa diseret (drag) untuk geser pin dan di-zoom (+/-).
 */
export function LocationMapPreview({
  lat,
  lng,
  zoom = DEFAULT_ZOOM,
  interactive = false,
  onChangeCoords,
  className,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  interactive?: boolean;
  onChangeCoords?: (coords: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const startRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const world = latLngToWorldPixels(lat, lng, zoom);
  const cx = Math.floor(world.x / TILE_SIZE);
  const cy = Math.floor(world.y / TILE_SIZE);
  const ox = world.x - cx * TILE_SIZE;
  const oy = world.y - cy * TILE_SIZE;

  const shiftX = -(TILE_SIZE + ox) + (drag?.x ?? 0);
  const shiftY = -(TILE_SIZE + oy) + (drag?.y ?? 0);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!interactive || !onChangeCoords) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0 });
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    setDrag({ x: e.clientX - s.x, y: e.clientY - s.y });
  }

  function finishDrag(e: PointerEvent<HTMLDivElement>) {
    const s = startRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    startRef.current = null;
    setDrag(null);
    if (onChangeCoords && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      const next = worldPixelsToLatLng(world.x - dx, world.y - dy, zoom);
      onChangeCoords(next);
    }
  }

  const offsets = [-1, 0, 1];

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      className={cn(
        "relative select-none overflow-hidden bg-[#E6ECE5] dark:bg-[#1E2C33]",
        interactive && "cursor-grab touch-none active:cursor-grabbing",
        className,
      )}
    >
      {/* Grid 3x3 tile Web Mercator presisi di sekitar titik koordinat */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 grid h-[768px] w-[768px] grid-cols-3 grid-rows-3 dark:brightness-[0.86] dark:contrast-[1.06]"
        style={{ transform: `translate3d(${shiftX}px, ${shiftY}px, 0)` }}
      >
        {offsets.map((dy) =>
          offsets.map((dx) => (
            <MapTile key={`${zoom}-${cx + dx}-${cy + dy}`} z={zoom} tx={cx + dx} ty={cy + dy} />
          )),
        )}
      </div>

      <MapCenterPin lifted={Boolean(drag && (Math.abs(drag.x) > 3 || Math.abs(drag.y) > 3))} />

      <span className="pointer-events-none absolute bottom-1 left-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
        © OpenStreetMap · CARTO
      </span>
    </div>
  );
}

/**
 * Kartu pesan lokasi gaya WhatsApp di dalam bubble chat:
 * pratinjau peta jalan + pin merah + alamat/koordinat + tombol Lihat Peta & Google Maps.
 */
export function LocationBubbleCard({
  lat,
  lng,
  label,
  address,
  mine,
  metaSlot,
  onOpenFullMap,
}: {
  lat: number;
  lng: number;
  label?: string;
  address?: string;
  mine: boolean;
  metaSlot?: ReactNode;
  onOpenFullMap: () => void;
}) {
  const title = label?.trim() || "Lokasi dibagikan";
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const gmapsUrl = buildGoogleMapsUrl(lat, lng);

  return (
    <div className="w-[264px] max-w-full overflow-hidden rounded-[6px] sm:w-[296px]">
      <button
        type="button"
        onClick={onOpenFullMap}
        aria-label={`Lihat peta penuh untuk ${title} (${coords})`}
        className="group relative block aspect-[16/10] w-full overflow-hidden rounded-t-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <LocationMapPreview lat={lat} lng={lng} zoom={16} className="size-full" />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-[2px] transition-colors group-hover:bg-black/75">
          <Maximize2 className="size-3" aria-hidden="true" />
          Lihat peta
        </span>
      </button>

      <div className="px-2.5 pb-1.5 pt-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold leading-snug">
              <MapPin className="size-3.5 shrink-0 text-[#E53935]" aria-hidden="true" />
              <span className="truncate">{title}</span>
            </p>
            <p
              className={cn(
                "mt-0.5 line-clamp-2 text-[12px] leading-snug",
                mine ? "text-[var(--wa-out-meta)]" : "text-[var(--wa-in-meta)]",
              )}
            >
              {address?.trim() || coords}
            </p>
          </div>
          {metaSlot ? <div className="shrink-0 self-end">{metaSlot}</div> : null}
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 divide-x border-t text-center text-[13px] font-semibold",
          mine
            ? "divide-chat-out-foreground/12 border-chat-out-foreground/12"
            : "divide-[var(--wa-border)] border-[var(--wa-border)]",
        )}
      >
        <button
          type="button"
          onClick={onOpenFullMap}
          className={cn(
            "inline-flex min-h-10 items-center justify-center gap-1.5 px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            mine
              ? "text-[var(--wa-pill-active-fg)] hover:bg-black/5 dark:hover:bg-white/5"
              : "text-[var(--wa-action)] hover:bg-[var(--wa-panel-hover)]",
          )}
        >
          <Navigation className="size-3.5" aria-hidden="true" />
          Peta interaktif
        </button>
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex min-h-10 items-center justify-center gap-1.5 px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            mine
              ? "text-[var(--wa-pill-active-fg)] hover:bg-black/5 dark:hover:bg-white/5"
              : "text-[var(--wa-action)] hover:bg-[var(--wa-panel-hover)]",
          )}
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Google Maps
        </a>
      </div>
    </div>
  );
}

/**
 * Modal peta interaktif penuh saat pengguna mengetuk kartu lokasi di chat.
 * Menyediakan Google Maps Embed + opsi beralih ke OpenStreetMap.
 */
export function LocationMapModal({
  location,
  onClose,
}: {
  location: SharedLocationPayload | null;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<"google" | "osm">("google");

  useEffect(() => {
    setProvider("google");
  }, [location?.lat, location?.lng]);

  if (!location) return null;

  const title = location.label?.trim() || "Lokasi dibagikan";
  const coords = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`;
  const iframeSrc =
    provider === "google"
      ? buildGoogleMapsEmbedUrl(location.lat, location.lng, 16)
      : buildOsmEmbedUrl(location.lat, location.lng);

  return (
    <Dialog open={Boolean(location)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--wa-border)] bg-[var(--wa-chrome)] px-4 py-3 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-1.5 truncate text-base text-[var(--wa-in-fg)]">
                <MapPin className="size-4 shrink-0 text-[#E53935]" aria-hidden="true" />
                {title}
              </DialogTitle>
              <DialogDescription className="mt-0.5 line-clamp-2 text-xs text-[var(--wa-in-meta)]">
                {location.address?.trim() || coords}
              </DialogDescription>
            </div>
            <div
              role="group"
              aria-label="Sumber peta"
              className="inline-flex shrink-0 rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel)] p-0.5 text-xs"
            >
              <button
                type="button"
                aria-pressed={provider === "google"}
                onClick={() => setProvider("google")}
                className={cn(
                  "min-h-8 rounded-md px-2.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  provider === "google"
                    ? "bg-[var(--wa-action)] text-[var(--wa-action-fg)]"
                    : "text-[var(--wa-in-meta)] hover:text-[var(--wa-in-fg)]",
                )}
              >
                Google
              </button>
              <button
                type="button"
                aria-pressed={provider === "osm"}
                onClick={() => setProvider("osm")}
                className={cn(
                  "min-h-8 rounded-md px-2.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  provider === "osm"
                    ? "bg-[var(--wa-action)] text-[var(--wa-action-fg)]"
                    : "text-[var(--wa-in-meta)] hover:text-[var(--wa-in-fg)]",
                )}
              >
                OSM
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="relative h-[52dvh] min-h-[300px] w-full bg-[var(--wa-panel)]">
          <iframe
            key={`${provider}-${coords}`}
            title={`Peta interaktif ${title}`}
            src={iframeSrc}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-full border-0"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--wa-border)] bg-[var(--wa-chrome)] px-4 py-3">
          <span className="font-mono text-xs tabular-nums text-[var(--wa-in-meta)]">{coords}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(coords);
                toast.success("Koordinat disalin.");
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel)] px-3 text-xs font-semibold text-[var(--wa-in-fg)] hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              Salin koordinat
            </button>
            <a
              href={buildGoogleMapsUrl(location.lat, location.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[var(--wa-action)] px-3.5 text-xs font-semibold text-[var(--wa-action-fg)] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Buka di Google Maps
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dialog "Kirim Lokasi" ala WhatsApp:
 * - Otomatis mendeteksi GPS pengguna dan menampilkan pratinjau peta langsung
 * - Mendukung seret peta (adjust pin), zoom +/-, pencarian tempat, & tempel link/koordinat
 * - Tetap bisa digunakan walau izin GPS diblokir (lewat pencarian alamat atau geser peta).
 */
export function LocationPickerDialog({
  open,
  onOpenChange,
  onConfirmSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSend: (payload: SharedLocationPayload, caption?: string) => void;
}) {
  const reverseGeo = useServerFn(reverseGeocodeLocation);
  const searchPlaces = useServerFn(searchLocationPlaces);

  const [coords, setCoords] = useState<{ lat: number; lng: number }>(FALLBACK_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [label, setLabel] = useState("Lokasi saya");
  const [address, setAddress] = useState("");
  const [caption, setCaption] = useState("");
  const [locating, setLocating] = useState(false);
  const [resolvingAddr, setResolvingAddr] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<
    Array<{ lat: number; lng: number; label: string; address: string }>
  >([]);

  const resolveSeqRef = useRef(0);

  const lookupAddress = useCallback(
    async (lat: number, lng: number, fallbackLabel = "Lokasi terpilih") => {
      const seq = ++resolveSeqRef.current;
      setResolvingAddr(true);
      try {
        const res = await reverseGeo({ data: { lat, lng } });
        if (seq !== resolveSeqRef.current) return;
        if (res.ok) {
          setLabel(res.label || fallbackLabel);
          setAddress(res.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        } else {
          setLabel(fallbackLabel);
          setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      } catch {
        if (seq !== resolveSeqRef.current) return;
        setLabel(fallbackLabel);
        setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } finally {
        if (seq === resolveSeqRef.current) setResolvingAddr(false);
      }
    },
    [reverseGeo],
  );

  const detectGps = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsError("Browser tidak mendukung GPS. Cari alamat atau geser pin di peta.");
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setCoords(next);
        setZoom(16);
        setLocating(false);
        void lookupAddress(next.lat, next.lng, "Lokasi saya saat ini");
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError(
            "Izin lokasi ditolak browser. Anda tetap bisa mencari tempat atau geser pin langsung di peta.",
          );
        } else {
          setGpsError(
            "Sinyal GPS belum didapat. Anda bisa coba lagi, cari alamat, atau geser pin di peta.",
          );
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, [lookupAddress]);

  useEffect(() => {
    if (!open) return;
    setSearchQuery("");
    setResults([]);
    setCaption("");
    detectGps();
  }, [open, detectGps]);

  async function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const raw = searchQuery.trim();
    if (!raw) return;

    const parsed = parseCoordinateOrMapsInput(raw);
    if (parsed) {
      setCoords(parsed);
      setZoom(16);
      setResults([]);
      setGpsError(null);
      void lookupAddress(parsed.lat, parsed.lng, "Lokasi dari tautan");
      return;
    }

    if (raw.length < 2) return;
    setSearching(true);
    try {
      const res = await searchPlaces({ data: { q: raw } });
      setResults(res.items ?? []);
      if (!res.items?.length) {
        toast.info("Lokasi tidak ditemukan. Coba nama jalan, kota, atau tempel koordinat.");
      }
    } catch {
      toast.error("Pencarian lokasi gagal. Coba lagi.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--wa-border)] bg-[var(--wa-brand)] px-4 py-3 text-left text-[var(--wa-brand-fg)]">
          <DialogTitle className="text-base font-semibold text-[var(--wa-brand-fg)]">
            Kirim Lokasi
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--wa-brand-fg)]/85">
            Geser peta untuk menyesuaikan pin, atau cari alamat di bawah ini.
          </DialogDescription>
        </DialogHeader>

        {/* Bar pencarian tempat / tempel link Maps */}
        <form
          onSubmit={(e) => void handleSearchSubmit(e)}
          className="relative flex items-center gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-chrome)] px-3 py-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--wa-in-meta)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari tempat, alamat, atau tempel link Maps..."
              aria-label="Cari alamat atau koordinat"
              className="h-10 w-full rounded-lg border border-[var(--wa-border)] bg-[var(--wa-input)] pl-9 pr-8 text-sm text-[var(--wa-in-fg)] outline-none placeholder:text-[var(--wa-in-meta)] focus:border-[var(--wa-action)] [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setResults([]);
                }}
                aria-label="Hapus pencarian lokasi"
                className="absolute right-0.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-[var(--wa-in-meta)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={searching || searchQuery.trim().length < 2}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-[var(--wa-action)] px-3.5 text-xs font-semibold text-[var(--wa-action-fg)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {searching ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Cari"}
          </button>
        </form>

        {/* Hasil pencarian alamat */}
        {results.length > 0 ? (
          <ul
            aria-label="Hasil pencarian lokasi"
            className="max-h-40 divide-y divide-[var(--wa-border)] overflow-y-auto border-b border-[var(--wa-border)] bg-[var(--wa-panel)]"
          >
            {results.map((item, idx) => (
              <li key={`${item.lat}-${item.lng}-${idx}`}>
                <button
                  type="button"
                  onClick={() => {
                    setCoords({ lat: item.lat, lng: item.lng });
                    setLabel(item.label);
                    setAddress(item.address);
                    setZoom(16);
                    setResults([]);
                    setGpsError(null);
                  }}
                  className="flex min-h-11 w-full items-start gap-2.5 px-3.5 py-2 text-left hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[#E53935]" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--wa-in-fg)]">
                      {item.label}
                    </span>
                    <span className="line-clamp-1 text-xs text-[var(--wa-in-meta)]">
                      {item.address}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Peta interaktif seret-untuk-geser pin */}
        <div className="relative h-60 w-full shrink-0 sm:h-64">
          <LocationMapPreview
            lat={coords.lat}
            lng={coords.lng}
            zoom={zoom}
            interactive
            onChangeCoords={(next) => {
              setCoords(next);
              setGpsError(null);
              void lookupAddress(next.lat, next.lng, "Titik peta dipilih");
            }}
            className="size-full"
          />

          {/* Kontrol zoom + pusatkan GPS */}
          <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={detectGps}
              disabled={locating}
              aria-label="Pusatkan ke lokasi GPS saya"
              className="grid size-10 place-items-center rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] text-[var(--wa-action)] shadow-md hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Crosshair className="size-4" aria-hidden="true" />
              )}
            </button>
            <div className="flex flex-col overflow-hidden rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] shadow-md">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(18, z + 1))}
                aria-label="Perbesar peta"
                className="grid size-10 place-items-center text-[var(--wa-in-fg)] hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(11, z - 1))}
                aria-label="Perkecil peta"
                className="grid size-10 place-items-center border-t border-[var(--wa-border)] text-[var(--wa-in-fg)] hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {locating ? (
            <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Mendeteksi GPS...
            </div>
          ) : null}
        </div>

        {/* Info titik terpilih + caption opsional + tombol kirim */}
        <div className="space-y-3 bg-[var(--wa-panel)] p-4">
          {gpsError ? (
            <p
              role="status"
              className="rounded-lg bg-[var(--wa-notice)] px-3 py-2 text-xs text-[var(--wa-notice-fg)]"
            >
              {gpsError}
            </p>
          ) : null}

          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wa-pill-active)] text-[var(--wa-pill-active-fg)]">
              <MapPin className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--wa-in-fg)]">
                {resolvingAddr ? "Mencari nama alamat..." : label}
              </p>
              <p className="line-clamp-2 text-xs text-[var(--wa-in-meta)]">
                {address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--wa-in-meta)]">
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={300}
              placeholder="Catatan lokasi (opsional), mis. Patokan depan gerbang..."
              aria-label="Catatan lokasi opsional"
              className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--wa-border)] bg-[var(--wa-input)] px-3 text-sm text-[var(--wa-in-fg)] outline-none placeholder:text-[var(--wa-in-meta)] focus:border-[var(--wa-action)]"
            />
            <button
              type="button"
              onClick={() => {
                onConfirmSend(
                  {
                    lat: coords.lat,
                    lng: coords.lng,
                    label: label.trim() || "Lokasi dibagikan",
                    address: address.trim() || undefined,
                  },
                  caption.trim() || undefined,
                );
                onOpenChange(false);
              }}
              className="press-scale inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[var(--wa-action)] px-4 text-sm font-semibold text-[var(--wa-action-fg)] hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SendHorizontal className="size-4" aria-hidden="true" />
              Kirim
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
