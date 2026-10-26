import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const reg = readFileSync("src/lib/website-settings.ts", "utf8");
const keys = [...new Set([...reg.matchAll(/key: "([a-z_.]+)"/g)].map((m) => m[1]))];

const files = [];
function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(p)) continue;
    if (p.includes("website-settings.ts")) continue;
    files.push(p);
  }
}
walk("src");

const consumers = {};
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const k of keys) {
    if (s.includes(k)) {
      (consumers[k] ||= []).push(relative("src", f).split("\\").join("/"));
    }
  }
}

const unused = keys.filter((k) => !consumers[k]);
const used = keys.filter((k) => consumers[k]);

console.log("TOTAL KEYS:", keys.length);
console.log("PUNYA CONSUMER:", used.length);
console.log("TANPA CONSUMER:", unused.length);
console.log("\n=== TANPA CONSUMER (stored-but-unused kandidat) ===");
unused.forEach((k) => console.log(" ", k));
console.log("\n=== CONSUMER 1 FILE ===");
used.filter((k) => consumers[k].length === 1).forEach((k) => console.log(" ", k, "→", consumers[k][0]));
console.log("\n=== CONSUMER DI SERVER/RPC (bukan UI) ===");
used.filter((k) => consumers[k].some((c) => c.includes("functions") || c.includes("server") || c.includes("migrations") === false && c.includes("routes"))).slice(0, 0);
