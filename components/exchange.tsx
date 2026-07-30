"use client";

import { useCallback, useRef, useState } from "react";

import { Answer } from "@/components/answer";
import { ChevronIcon } from "@/components/icons";
import { Meter, Notice, ScoreDot } from "@/components/ui";
import { formatMs } from "@/lib/api";
import type { QueryResult } from "@/lib/types";

export type Exchange = {
  key: string;
  query: string;
  result: QueryResult | null;
  error: string | null;
};

function StageBar({ timings }: { timings: QueryResult["timings"] }) {
  const stages = [
    { label: "embed", ms: timings.embed_ms, className: "bg-brass-dim" },
    { label: "retrieve", ms: timings.retrieve_ms, className: "bg-brass" },
    { label: "generate", ms: timings.generate_ms, className: "bg-sage" },
    { label: "audit", ms: timings.judge_ms, className: "bg-amber" },
  ].filter((stage) => stage.ms > 0);

  const total = stages.reduce((sum, stage) => sum + stage.ms, 0) || 1;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex h-1 min-w-40 flex-1 overflow-hidden rounded-full bg-raised">
        {stages.map((stage) => (
          <div
            key={stage.label}
            className={stage.className}
            style={{ width: `${(stage.ms / total) * 100}%` }}
            title={`${stage.label} ${formatMs(stage.ms)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 numeric text-[11px] text-ink-3">
        {stages.map((stage) => (
          <span key={stage.label}>
            {stage.label} {formatMs(stage.ms)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ExchangeView({ exchange }: { exchange: Exchange }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const sourceRefs = useRef<(HTMLLIElement | null)[]>([]);

  const jumpToSource = useCallback((index: number) => {
    setOpen(true);
    setHighlighted(index);
    // Wait a frame so the panel has expanded before scrolling into it.
    requestAnimationFrame(() => {
      sourceRefs.current[index - 1]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, []);

  const { query, result, error } = exchange;

  return (
    <article className="animate-rise border-b border-line-soft pb-10 last:border-b-0">
      <p className="eyebrow">Question</p>
      <h2 className="mt-2.5 font-display text-[26px] leading-[1.25] tracking-tight text-ink">
        {query}
      </h2>

      {!result && !error && (
        <div className="mt-7">
          <div className="sweep-line h-px w-full bg-line-soft" />
          <p className="mt-4 animate-pulse-soft text-[13px] text-ink-3">
            Searching the archive…
          </p>
        </div>
      )}

      {error && (
        <div className="mt-6">
          <Notice tone="rust">{error}</Notice>
        </div>
      )}

      {result && (
        <>
          <div className="mt-6">
            <Answer
              text={result.answer}
              sourceCount={result.sources.length}
              onCite={jumpToSource}
            />
          </div>

          {result.judge && result.judge.unsupported_claims.length > 0 && (
            <div className="mt-6">
              <Notice tone="amber">
                <p className="font-medium">
                  The audit flagged {result.judge.unsupported_claims.length}{" "}
                  claim
                  {result.judge.unsupported_claims.length === 1 ? "" : "s"} the
                  sources do not support:
                </p>
                <ul className="mt-2 space-y-1 text-amber/85">
                  {result.judge.unsupported_claims.map((claim, i) => (
                    <li key={i}>“{claim}”</li>
                  ))}
                </ul>
              </Notice>
            </div>
          )}

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Meter
              label="Top match"
              value={result.metrics.retrieval.top_score}
              display={result.metrics.retrieval.top_score.toFixed(3)}
              tone={
                result.metrics.retrieval.top_score >= 0.5 ? "sage" : "amber"
              }
            />
            <Meter
              label="Grounding"
              value={result.metrics.grounding}
              display={`${Math.round(result.metrics.grounding * 100)}%`}
              tone={result.metrics.grounding >= 0.6 ? "sage" : "amber"}
            />
            <Meter
              label="Query coverage"
              value={result.metrics.coverage}
              display={`${Math.round(result.metrics.coverage * 100)}%`}
              tone={result.metrics.coverage >= 0.5 ? "sage" : "amber"}
            />
            {result.judge ? (
              <Meter
                label="Audited groundedness"
                value={result.judge.groundedness}
                max={100}
                display={`${result.judge.groundedness}`}
                tone={result.judge.groundedness >= 70 ? "sage" : "rust"}
              />
            ) : (
              <Meter
                label="Cited sources"
                value={result.metrics.citations.count}
                max={Math.max(1, result.sources.length)}
                display={`${result.metrics.citations.count} of ${result.sources.length}`}
                tone={result.metrics.citations.count ? "brass" : "rust"}
              />
            )}
          </div>

          <div className="mt-6">
            <StageBar timings={result.timings} />
          </div>

          {result.sources.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="group flex items-center gap-2 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2"
              >
                <ChevronIcon
                  className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                />
                <span>
                  {open ? "Hide" : "Show"} {result.sources.length} retrieved
                  chunk
                  {result.sources.length === 1 ? "" : "s"}
                </span>
                <span className="numeric text-ink-3/70">
                  · {result.metrics.retrieval.documents} document
                  {result.metrics.retrieval.documents === 1 ? "" : "s"} ·{" "}
                  {formatMs(result.timings.total_ms)} total
                </span>
              </button>

              {open && (
                <ol className="mt-4 space-y-2">
                  {result.sources.map((source, i) => {
                    const number = i + 1;
                    const cited = result.metrics.citations.cited.includes(
                      number,
                    );
                    return (
                      <li
                        key={source.id}
                        ref={(node) => {
                          sourceRefs.current[i] = node;
                        }}
                        onMouseLeave={() => setHighlighted(null)}
                        className={`panel animate-fade px-4 py-3.5 transition-colors ${
                          highlighted === number
                            ? "border-brass-dim bg-brass/6"
                            : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span
                            className={`grid size-5 shrink-0 place-items-center rounded-[4px] border numeric text-[10.5px] ${
                              cited
                                ? "border-brass-dim/60 bg-brass/10 text-brass"
                                : "border-line-soft text-ink-3"
                            }`}
                          >
                            {number}
                          </span>
                          <span className="min-w-0 truncate text-[12.5px] text-ink-2">
                            {source.filename}
                          </span>
                          <span className="numeric text-[11px] text-ink-3">
                            chunk {source.chunk_index}
                          </span>
                          <span className="ml-auto">
                            <ScoreDot score={source.score} />
                          </span>
                        </div>
                        <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">
                          {source.text}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}
