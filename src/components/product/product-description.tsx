import { useState } from "react";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Deskripsi seller berupa teks polos (sering penuh emoji). Komponen ini
 * menyusunnya ulang jadi struktur yang mudah dipindai tanpa mengubah isi:
 * - baris emoji pendek yang diikuti daftar/spesifikasi → judul bagian
 * - "✅ Judul" (+ paragraf berikutnya) → item fitur dengan ikon centang
 * - "Kunci: Nilai" berurutan → tabel ringkas
 * - bagian "⚠️" → kotak peringatan
 * Teks panjang dipotong dengan tombol "Lihat selengkapnya".
 */

const EMOJI_START = /^\p{Extended_Pictographic}/u;
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u;
const CHECK_START = /^[✅✔☑]/u;
const KEY_VALUE = /^([^:\n]{2,32}):\s+(.+)$/;

type Node =
  | { kind: "p"; text: string }
  | { kind: "item"; check: boolean; emoji: string; title: string; desc: string | null }
  | { kind: "kv"; rows: Array<[string, string]> };

type Section = { title: string | null; warning: boolean; nodes: Node[] };

const stripEmoji = (s: string) => s.replace(EMOJI_PREFIX, "").trim();
const leadingEmoji = (s: string) => s.match(EMOJI_PREFIX)?.[0].trim() ?? "";

function isHeading(block: string, next: string | undefined) {
  if (!EMOJI_START.test(block) || CHECK_START.test(block)) return false;
  if (block.includes("\n") || block.length > 50) return false;
  if (block.startsWith("⚠")) return true;
  if (!next) return false;
  return EMOJI_START.test(next) || KEY_VALUE.test(next);
}

function parse(text: string): Section[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const sections: Section[] = [{ title: null, warning: false, nodes: [] }];
  const current = () => sections[sections.length - 1];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];

    if (isHeading(block, next)) {
      sections.push({ title: stripEmoji(block), warning: block.startsWith("⚠"), nodes: [] });
      continue;
    }

    if (EMOJI_START.test(block)) {
      const [first, ...rest] = block.split("\n");
      let title = stripEmoji(first);
      let desc: string | null = rest.join("\n").trim() || null;
      const nextIsPlain = Boolean(next && !EMOJI_START.test(next) && !KEY_VALUE.test(next));

      // Ajakan penutup setelah blok peringatan jangan ikut masuk kotak peringatan.
      if (current().warning && !CHECK_START.test(block)) {
        sections.push({ title, warning: false, nodes: desc ? [{ kind: "p", text: desc }] : [] });
        continue;
      }

      // Paragraf polos tepat setelah item = penjelasan item.
      if (!desc && nextIsPlain) {
        desc = next!;
        i++;
      }
      const dash = title.match(/^(.{2,60}?)\s+[–—-]\s+(.+)$/);
      if (!desc && dash) {
        title = dash[1];
        desc = dash[2];
      }
      current().nodes.push({
        kind: "item",
        check: CHECK_START.test(block),
        emoji: leadingEmoji(first),
        title,
        desc,
      });
      continue;
    }

    const kv = block.match(KEY_VALUE);
    if (kv && !block.includes("\n")) {
      const nodes = current().nodes;
      const last = nodes[nodes.length - 1];
      if (last?.kind === "kv") last.rows.push([kv[1].trim(), kv[2].trim()]);
      else nodes.push({ kind: "kv", rows: [[kv[1].trim(), kv[2].trim()]] });
      continue;
    }

    current().nodes.push({ kind: "p", text: block });
  }

  return sections.filter((s) => s.title || s.nodes.length);
}

function Items({ nodes }: { nodes: Node[] }) {
  return (
    <>
      {nodes.map((node, idx) => {
        if (node.kind === "p") {
          return (
            <p key={idx} className="whitespace-pre-line break-words text-sm leading-7 text-muted-foreground">
              {node.text}
            </p>
          );
        }
        if (node.kind === "kv") {
          return (
            <dl key={idx} className="divide-y divide-border rounded-lg border border-border text-sm">
              {node.rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          );
        }
        return null;
      })}
    </>
  );
}

function SectionBody({ nodes }: { nodes: Node[] }) {
  // Kelompokkan item berurutan jadi satu grid; node lain dirender apa adanya.
  const groups: Array<{ items: Extract<Node, { kind: "item" }>[] } | { other: Node[] }> = [];
  for (const n of nodes) {
    const last = groups[groups.length - 1];
    if (n.kind === "item") {
      if (last && "items" in last) last.items.push(n);
      else groups.push({ items: [n] });
    } else if (last && "other" in last) last.other.push(n);
    else groups.push({ other: [n] });
  }

  return (
    <div className="space-y-3">
      {groups.map((g, gi) =>
        "items" in g ? (
          <ul key={gi} className="grid gap-2 sm:grid-cols-2">
            {g.items.map((it, ii) => (
              <li key={ii} className="flex gap-3 rounded-lg border border-border bg-surface p-3">
                {it.check ? (
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                ) : (
                  <span className="shrink-0 text-base leading-6" aria-hidden="true">
                    {it.emoji}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{it.title}</p>
                  {it.desc ? (
                    <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground">
                      {it.desc}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Items key={gi} nodes={g.other} />
        ),
      )}
    </div>
  );
}

export function ProductDescription({ text }: { text: string }) {
  const sections = parse(text);
  const long = text.length > 700;
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div
        id="isi-deskripsi"
        className={cn("relative space-y-6", long && !open && "max-h-[28rem] overflow-hidden")}
      >
        {sections.map((s, si) => (
          <div
            key={si}
            className={cn(
              s.warning && "rounded-lg border border-warning/40 bg-warning/10 p-4",
            )}
          >
            {s.title ? (
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {s.warning ? (
                  <AlertTriangle className="size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                ) : (
                  <span className="h-4 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                )}
                {s.title}
              </h3>
            ) : null}
            <SectionBody nodes={s.nodes} />
          </div>
        ))}
        {long && !open ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card to-transparent"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls="isi-deskripsi"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-primary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {open ? "Tutup deskripsi" : "Lihat selengkapnya"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
