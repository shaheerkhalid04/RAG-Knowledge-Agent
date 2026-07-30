"use client";

import { Fragment } from "react";

/**
 * A deliberately small Markdown renderer.
 *
 * The model only ever emits headings, lists, bold, inline code and bracketed
 * citations, and the citations need to become interactive elements rather than
 * literal text — which is awkward to do through a general Markdown library.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/g;
const BULLET = /^\s*[-*•]\s+/;
const ORDERED = /^\s*(\d{1,2})[.)]\s+/;
const HEADING = /^\s*(#{1,4})\s+/;

type Props = {
  text: string;
  sourceCount: number;
  onCite?: (index: number) => void;
};

function Inline({ text, sourceCount, onCite }: Props) {
  const parts = text.split(INLINE).filter(Boolean);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }

        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded border border-line-soft bg-raised/70 px-1 py-0.5 font-mono text-[0.85em] text-brass"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        const citation = /^\[(\d{1,2})\]$/.exec(part);
        if (citation) {
          const number = Number(citation[1]);
          const valid = number >= 1 && number <= sourceCount;
          if (!valid) {
            // A citation pointing at a source that was never retrieved is a
            // real signal, so show it rather than silently dropping it.
            return (
              <span
                key={i}
                title="This citation does not match any retrieved source"
                className="mx-0.5 inline-flex numeric text-[0.72em] text-rust/80 align-super"
              >
                [{number}]
              </span>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCite?.(number)}
              title={`Jump to source ${number}`}
              className="mx-0.5 inline-flex size-[1.15em] translate-y-[-0.35em] items-center justify-center rounded-[3px] border border-brass-dim/60 bg-brass/10 numeric text-[0.68em] leading-none text-brass transition-colors hover:border-brass hover:bg-brass/20"
            >
              {number}
            </button>
          );
        }

        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h"; level: number; text: string };

function parse(text: string): Block[] {
  const blocks: Block[] = [];

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      if (blocks.at(-1)?.kind === "p") blocks.push({ kind: "p", lines: [] });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "h",
        level: heading[1].length,
        text: line.replace(HEADING, ""),
      });
      continue;
    }

    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      const last = blocks.at(-1);
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
      continue;
    }

    if (ORDERED.test(line)) {
      const item = line.replace(ORDERED, "");
      const last = blocks.at(-1);
      if (last?.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", items: [item] });
      continue;
    }

    const last = blocks.at(-1);
    if (last?.kind === "p") last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }

  return blocks.filter(
    (block) =>
      block.kind !== "p" || block.lines.some((line) => line.trim().length),
  );
}

export function Answer({ text, sourceCount, onCite }: Props) {
  const blocks = parse(text);

  return (
    <div className="space-y-3.5 text-[15px] leading-[1.72] text-ink-2">
      {blocks.map((block, i) => {
        if (block.kind === "h") {
          return (
            <h3
              key={i}
              className="pt-2 font-display text-[19px] leading-snug text-ink"
            >
              <Inline
                text={block.text}
                sourceCount={sourceCount}
                onCite={onCite}
              />
            </h3>
          );
        }

        if (block.kind === "ul" || block.kind === "ol") {
          const Tag = block.kind === "ul" ? "ul" : "ol";
          return (
            <Tag key={i} className="space-y-2 pl-1">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span
                    className={
                      block.kind === "ul"
                        ? "mt-[0.66em] size-1 shrink-0 rounded-full bg-brass-dim"
                        : "w-4 shrink-0 numeric text-[12px] leading-[1.9] text-brass-dim"
                    }
                    aria-hidden={block.kind === "ul"}
                  >
                    {block.kind === "ol" ? `${j + 1}.` : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Inline
                      text={item}
                      sourceCount={sourceCount}
                      onCite={onCite}
                    />
                  </span>
                </li>
              ))}
            </Tag>
          );
        }

        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline
                  text={line}
                  sourceCount={sourceCount}
                  onCite={onCite}
                />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
