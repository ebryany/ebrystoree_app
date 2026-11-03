import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Hanya tautan http/https absolut (menolak `javascript:`, `data:`, dll.). */
export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^/?#\s]/i.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

/**
 * Kata kunci aman untuk filter PostgREST `.or(...ilike...)`. Koma, titik,
 * kurung, dan kutip bisa menambah klausa filter; `%`/`_` adalah wildcard LIKE.
 */
export function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[%_,.()"'\\*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Path internal yang aman untuk redirect setelah login (`?next=`).
 * Browser memperlakukan `\` sebagai `/` dan membuang tab/newline, jadi
 * `/\evil.com` atau `/%09/evil.com` bisa jadi open redirect kalau hanya dicek
 * dengan `startsWith("/")`. Nilai di-resolve terhadap origin tiruan; yang
 * keluar dari origin itu ditolak.
 */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (/[\\\p{Cc}]/u.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\p{Cc}]/u.test(decoded) || decoded.startsWith("//")) return null;
    const base = "https://internal.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function isRenderableImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || /[\s\p{Cc}\\]/u.test(value)) return false;
  try {
    if (value.startsWith("/api/public/catalog-image/")) {
      const path = value.slice("/api/public/catalog-image/".length);
      return (
        !/[?#]/.test(path) &&
        path.split("/").every((segment) => {
          const decoded = decodeURIComponent(segment);
          return (
            decoded !== "" &&
            decoded !== "." &&
            decoded !== ".." &&
            !/[\s\p{Cc}/\\%]/u.test(decoded)
          );
        })
      );
    }
    if (!/^https?:\/\/[^/?#]/i.test(value)) return false;
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
