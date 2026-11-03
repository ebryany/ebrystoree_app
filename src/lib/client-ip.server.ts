/**
 * IP klien untuk rate limit dan log audit.
 *
 * Trafik produksi lewat Cloudflare, yang selalu MENIMPA `cf-connecting-ip`,
 * jadi header itu tidak bisa dipalsukan klien. Entri pertama `x-forwarded-for`
 * justru dikirim klien dan mudah dipalsukan, jadi hanya dipakai paling akhir
 * (mis. dev lokal tanpa proxy).
 */
export function clientIpFrom(get: (name: string) => string | null | undefined): string | null {
  const cf = get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || null;
}

/** IP klien dari request server function yang sedang berjalan. */
export async function requestClientIp(): Promise<string | null> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    return clientIpFrom((name) => getRequestHeader(name));
  } catch {
    return null;
  }
}
