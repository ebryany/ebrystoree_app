import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearServerCache, getOrLoad } from "@/lib/server-cache.server";

describe("Server singleflight TTL cache & SSR QueryClient memory safety", () => {
  beforeEach(() => {
    clearServerCache();
  });

  it("coalesces concurrent cache-miss callers into a single upstream query (singleflight)", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, calls };
    });

    const results = await Promise.all(
      Array.from({ length: 25 }, () => getOrLoad("test", "home", 10_000, loader)),
    );
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.calls === 1)).toBe(true);
  });

  it("does not cache transient errors when shouldCache returns false", async () => {
    let attempt = 0;
    const loader = async () => {
      attempt += 1;
      return attempt === 1 ? { error: "down", items: [] } : { error: null, items: ["ok"] };
    };

    const first = await getOrLoad("test", "k", 10_000, loader, {
      shouldCache: (v) => v.error === null,
    });
    expect(first.error).toBe("down");

    const second = await getOrLoad("test", "k", 10_000, loader, {
      shouldCache: (v) => v.error === null,
    });
    expect(second.error).toBeNull();
    expect(second.items).toEqual(["ok"]);
  });

  it("bounds memory growth via maxEntries eviction", async () => {
    const loader = vi.fn(async (k: string) => k);
    for (let i = 0; i < 10; i += 1) {
      await getOrLoad("bounded", `k-${i}`, 60_000, () => loader(`k-${i}`), { maxEntries: 3 });
    }
    expect(loader).toHaveBeenCalledTimes(10);
    // k-9 masih ada di cache (tidak memanggil loader lagi)
    await getOrLoad("bounded", "k-9", 60_000, () => loader("k-9"), { maxEntries: 3 });
    expect(loader).toHaveBeenCalledTimes(10);
    // k-0 sudah ter-evict (memanggil loader kembali)
    await getOrLoad("bounded", "k-0", 60_000, () => loader("k-0"), { maxEntries: 3 });
    expect(loader).toHaveBeenCalledTimes(11);
  });

  it("sets gcTime to Infinity on SSR in src/router.tsx to prevent 10-minute QueryClient timer leaks", () => {
    const routerSrc = readFileSync("src/router.tsx", "utf8");
    expect(routerSrc).toContain('const isServer = typeof window === "undefined"');
    expect(routerSrc).toContain("gcTime: isServer ? Infinity : 10 * 60_000");
    expect(routerSrc).toContain("retry: isServer ? 0 : 1");
  });
});
