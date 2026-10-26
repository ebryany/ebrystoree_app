import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
