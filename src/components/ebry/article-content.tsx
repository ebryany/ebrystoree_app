import { Fragment, type ReactNode } from "react";
import { isSafeUrl } from "@/lib/website-settings";

/** Render subset Markdown (heading, list, kutipan, pemisah, tebal/miring/kode/tautan). */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`"))
      nodes.push(
        <code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const rawHref = token.slice(token.indexOf("(") + 1, -1).trim();
      if (isSafeUrl(rawHref)) {
        const external = /^https?:/i.test(rawHref);
        nodes.push(
          <a
            key={key}
            href={rawHref}
            {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}
            className="font-medium text-accent underline underline-offset-4"
          >
            {label}
          </a>,
        );
      } else {
        // Skema tautan tidak aman (javascript:, data:, vbscript:, file:) — render sebagai teks biasa.
        nodes.push(<Fragment key={key}>{label}</Fragment>);
      }
    } else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function ArticleContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  let paragraph: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    const items = list.map((item, i) => (
      <li key={i} className="pl-1 leading-relaxed marker:text-accent">
        {inline(item, `li-${blocks.length}-${i}`)}
      </li>
    ));
    blocks.push(
      ordered ? (
        <ol key={`b${blocks.length}`} className="ml-5 list-decimal space-y-2 text-muted-foreground">
          {items}
        </ol>
      ) : (
        <ul key={`b${blocks.length}`} className="ml-5 list-disc space-y-2 text-muted-foreground">
          {items}
        </ul>
      ),
    );
    list = [];
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    blocks.push(
      <p key={`b${blocks.length}`} className="leading-8 text-muted-foreground">
        {inline(text, `p-${blocks.length}`)}
      </p>,
    );
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      flushParagraph();
      continue;
    }
    if (/^(---|\*\*\*)$/.test(line)) {
      flushList();
      flushParagraph();
      blocks.push(<hr key={`b${blocks.length}`} className="my-8 border-border" />);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      flushParagraph();
      const level = heading[1].length;
      const cls =
        level === 1
          ? "mt-12 text-2xl font-bold leading-tight sm:text-3xl"
          : level === 2
            ? "mt-10 text-xl font-bold leading-tight sm:text-2xl"
            : "mt-8 text-lg font-bold leading-tight";
      const Tag = (level === 1 ? "h2" : level === 2 ? "h3" : "h4") as "h2";
      blocks.push(
        <Tag key={`b${blocks.length}`} className={cls}>
          {inline(heading[2], `h-${blocks.length}`)}
        </Tag>,
      );
      continue;
    }
    if (line.startsWith("> ")) {
      flushList();
      flushParagraph();
      blocks.push(
        <blockquote
          key={`b${blocks.length}`}
          className="border-l-4 border-accent bg-secondary px-5 py-5 text-foreground/90 italic sm:px-7"
        >
          {inline(line.slice(2), `q-${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const nextOrdered = Boolean(numbered);
      if (list.length && nextOrdered !== ordered) flushList();
      ordered = nextOrdered;
      list.push((bullet?.[1] ?? numbered?.[1]) as string);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushList();
  flushParagraph();

  return <div className="space-y-6 text-[15px] sm:text-[17px] [&>p:first-child]:text-lg [&>p:first-child]:leading-8 [&>p:first-child]:text-foreground/80">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}