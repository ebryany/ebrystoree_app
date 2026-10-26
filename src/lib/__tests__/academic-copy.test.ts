import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** AS-1 regression: konteks lama (joki/game) tidak boleh kembali ke source runtime. */
const ROOTS = ["src/routes", "src/components", "src/lib"];
const IGNORE = ["routeTree.gen.ts", "academic-copy.test.ts"];
const FORBIDDEN = /joki|mobile legends|push rank|akun game|id akun|win rate|boosting|leveling|grinding/i;

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (IGNORE.includes(entry)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("AS-1 copy cleanup", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("tidak ada istilah joki/game aktif di source", () => {
    const offenders = files.filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("checkout layanan tidak lagi memiliki field ID akun", () => {
    const src = readFileSync("src/routes/_authenticated/checkout.layanan.$slug.tsx", "utf8");
    expect(src).not.toMatch(/htmlFor="akun"/);
    expect(src).not.toMatch(/accountId/);
    expect(src).toMatch(/kredensial/i);
    expect(src).toMatch(/integritas akademik/i);
  });

  it("label tipe order memakai terminologi akademik", async () => {
    const { ORDER_TYPE_LABEL } = await import("@/lib/transaction-labels");
    expect(ORDER_TYPE_LABEL.service).toBe("Pesanan Akademik");
  });
});