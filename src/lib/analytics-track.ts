/**
 * Pengirim event analytics dari sisi klien.
 *
 * Keputusan dan alasannya:
 * - **Gagal diam-diam.** Analitik tidak boleh mengganggu pengalaman pengguna;
 *   bila endpoint tidak tersedia, halaman tetap berjalan normal.
 * - **sendBeacon bila tersedia.** Event terakhir sebelum pengguna menutup halaman
 *   tetap terkirim; `fetch` biasa sering dibatalkan saat navigasi.
 * - **Tanpa cookie, tanpa penyimpanan.** Tidak ada ID yang bertahan antar hari,
 *   jadi tidak ada pelacakan lintas kunjungan (sesuai keputusan privasi).
 * - **Dedup navigasi.** Router dapat memanggil beberapa kali untuk URL yang sama
 *   (mis. karena re-render); pengiriman di-dedup dalam jendela singkat.
 */

type EventName =
  | "page_view"
  | "product_view"
  | "service_view"
  | "article_view"
  | "checkout_start"
  | "payment_success";

type Payload = {
  event: EventName;
  path: string;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

const ENDPOINT = "/api/public/analytics/track";

/** Dedup: kunci terakhir + waktu, untuk mencegah kiriman ganda dalam 1 detik. */
let lastKey = "";
let lastAt = 0;

function utmFromLocation(): Pick<Payload, "utmSource" | "utmMedium" | "utmCampaign"> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
  };
}

export function trackEvent(event: EventName, path?: string): void {
  if (typeof window === "undefined") return;

  const target = path ?? window.location.pathname;
  const key = `${event}:${target}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < 1000) return;
  lastKey = key;
  lastAt = now;

  const body = JSON.stringify({
    event,
    path: target,
    referrer: document.referrer || null,
    ...utmFromLocation(),
  });

  try {
    // Token sesi (bila ada) dipakai server HANYA untuk atribusi kampanye yang
    // benar: menghubungkan kunjungan ke order milik orang yang sama. Pengunjung
    // anonim tidak mengirim token, dan event-nya tetap tercatat.
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const raw = window.localStorage.getItem("sb-wcxaheqnnsbhifpgiedk-auth-token");
      if (raw) {
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed?.access_token) {
          headers = { ...headers, Authorization: `Bearer ${parsed.access_token}` };
        }
      }
    } catch {
      /* tanpa token tetap dikirim */
    }

    // sendBeacon tidak bisa mengirim header, jadi hanya dipakai saat anonim.
    if (
      !headers.Authorization &&
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }

    void fetch(ENDPOINT, {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => {
      /* analitik tidak boleh mengganggu halaman */
    });
  } catch {
    /* analitik tidak boleh mengganggu halaman */
  }
}
