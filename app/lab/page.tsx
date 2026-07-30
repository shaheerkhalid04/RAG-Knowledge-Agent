"use client";

import { useCallback, useMemo, useState } from "react";

import { Notice, PageHeader, ScoreDot, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { api, formatMs } from "@/lib/api";
import type { LabComparison, ReindexResult } from "@/lib/types";

export default function LabPage() {
  const { health, dimension, documents } = useWorkspace();

  const supported = useMemo(
    () => health?.supported_dimensions ?? [384, 512, 768, 1024, 2048],
    [health],
  );

  // Both of these are derived rather than mirrored into state: the override is
  // only set once the user acts or a mirror run changes what exists.
  const [indexedOverride, setIndexedOverride] = useState<number[] | null>(null);
  const indexed = useMemo(
    () => indexedOverride ?? health?.indexed_dimensions ?? [],
    [indexedOverride, health],
  );

  const [targetChoice, setTargetChoice] = useState<number | null>(null);
  const target =
    targetChoice ??
    supported.find((value) => value !== dimension && !indexed.includes(value)) ??
    supported.find((value) => value !== dimension) ??
    null;

  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [comparison, setComparison] = useState<LabComparison | null>(null);
  const [comparing, setComparing] = useState(false);

  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<ReindexResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshIndexed = useCallback(async () => {
    try {
      const result = await api.health();
      setIndexedOverride(result.indexed_dimensions);
    } catch {
      // Leave the previous list in place; the next action will surface errors.
    }
  }, []);

  const mirror = useCallback(async () => {
    if (target === null) return;
    setReindexing(true);
    setError(null);
    setReindexResult(null);
    try {
      const result = await api.reindex(dimension, target);
      setReindexResult(result);
      await refreshIndexed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReindexing(false);
    }
  }, [dimension, refreshIndexed, target]);

  const compare = useCallback(async () => {
    if (!query.trim()) return;
    setComparing(true);
    setError(null);
    try {
      setComparison(
        await api.compare({ query: query.trim(), top_k: topK, dimensions: indexed }),
      );
    } catch (err) {
      setError((err as Error).message);
      setComparison(null);
    } finally {
      setComparing(false);
    }
  }, [indexed, query, topK]);

  const available = comparison?.runs.filter((run) => run.available) ?? [];
  const bestScore = Math.max(
    ...available.map((run) => run.metrics?.top_score ?? 0),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:px-10">
      <PageHeader
        eyebrow="Benchmark"
        title="Dimension Lab"
        lede="The same corpus, embedded at different widths. Wider vectors carry more nuance and cost more to store and search — this measures whether the extra width actually buys better retrieval on your documents."
      />

      <section className="mt-10">
        <h2 className="font-display text-[20px] text-ink">
          1 — Mirror the corpus
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          A Pinecone index has one fixed dimension, so a comparison needs the
          same documents indexed at each width. Chunk text is already stored
          alongside every vector, so mirroring re-embeds the existing corpus
          without asking you to upload anything again.
        </p>

        <div className="panel mt-5 px-5 py-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="eyebrow">From</p>
              <p className="mt-2 numeric text-[15px] text-ink">
                {dimension} dimensions
              </p>
              <p className="mt-1 text-[11.5px] text-ink-3">
                {documents.length} document{documents.length === 1 ? "" : "s"}
              </p>
            </div>

            <span className="pb-2 text-ink-3">→</span>

            <label className="min-w-40">
              <span className="eyebrow">To</span>
              <select
                value={target ?? ""}
                onChange={(event) => setTargetChoice(Number(event.target.value))}
                className="mt-2 w-full cursor-pointer appearance-none rounded-md border border-line-soft bg-raised/60 px-3 py-2 numeric text-[13px] text-ink-2 transition-colors hover:border-line hover:text-ink"
              >
                {supported
                  .filter((value) => value !== dimension)
                  .map((value) => (
                    <option key={value} value={value}>
                      {value} dimensions
                      {indexed.includes(value) ? " (indexed)" : ""}
                    </option>
                  ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void mirror()}
              disabled={reindexing || target === null || documents.length === 0}
              className="ml-auto flex items-center gap-2 rounded-lg bg-brass px-4 py-2 text-[13px] text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {reindexing && <Spinner className="size-3.5" />}
              {reindexing ? "Re-embedding…" : "Mirror corpus"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            <span className="eyebrow">Indexed</span>
            {supported.map((value) => (
              <span
                key={value}
                className={`rounded-md border px-2 py-1 numeric text-[11px] ${
                  indexed.includes(value)
                    ? "border-brass-dim/60 bg-brass/10 text-brass"
                    : "border-line-soft text-ink-3"
                }`}
              >
                {value}
              </span>
            ))}
          </div>
        </div>

        {documents.length === 0 && (
          <div className="mt-4">
            <Notice>
              Add documents in Sources first — there is nothing to mirror yet.
            </Notice>
          </div>
        )}

        {reindexResult && (
          <div className="mt-4">
            <Notice tone={reindexResult.truncated ? "amber" : "sage"}>
              Re-embedded {reindexResult.chunks_copied.toLocaleString()} chunks
              at {reindexResult.target} dimensions in{" "}
              {formatMs(reindexResult.elapsed_ms)}.
              {reindexResult.truncated &&
                " Stopped early to stay inside the serverless time limit — run it again to continue."}
            </Notice>
          </div>
        )}
      </section>

      <section className="mt-14">
        <h2 className="font-display text-[20px] text-ink">
          2 — Run the same query everywhere
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">
          Retrieval only — no generation. The variable under test is embedding
          width, and an LLM call would bury the difference in noise.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void compare();
          }}
          className="panel mt-5 flex flex-wrap items-center gap-3 px-4 py-3"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A question your documents should answer…"
            className="min-w-52 flex-1 bg-transparent py-1.5 text-[14px] placeholder:text-ink-3/70 focus:outline-none"
          />
          <label className="flex items-center gap-2 text-[11.5px] text-ink-3">
            top-k
            <input
              type="range"
              min={1}
              max={12}
              value={topK}
              onChange={(event) => setTopK(Number(event.target.value))}
              className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-raised accent-brass"
            />
            <span className="w-3 numeric text-ink-2">{topK}</span>
          </label>
          <button
            type="submit"
            disabled={comparing || !query.trim() || indexed.length === 0}
            className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-brass-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            {comparing && <Spinner className="size-3.5" />}
            {comparing ? "Running…" : "Compare"}
          </button>
        </form>

        {indexed.length < 2 && (
          <p className="mt-3 text-[12px] text-ink-3">
            Only {indexed.length} dimension
            {indexed.length === 1 ? " is" : "s are"} indexed. Mirror the corpus
            above to make this a real comparison.
          </p>
        )}

        {error && (
          <div className="mt-4">
            <Notice tone="rust">{error}</Notice>
          </div>
        )}

        {comparison && available.length > 0 && (
          <div className="mt-6 space-y-3">
            {available.map((run) => {
              const top = run.metrics?.top_score ?? 0;
              const best = bestScore > 0 && top === bestScore;
              return (
                <div
                  key={run.dimension}
                  className={`panel px-5 py-4 ${best ? "border-brass-dim/60" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="numeric text-[17px] text-ink">
                      {run.dimension}d
                    </span>
                    {best && (
                      <span className="rounded border border-brass-dim/60 bg-brass/10 px-1.5 py-0.5 eyebrow text-brass">
                        best match
                      </span>
                    )}
                    <span className="numeric text-[11.5px] text-ink-3">
                      {(run.chunks ?? 0).toLocaleString()} chunks
                    </span>
                    <span className="ml-auto flex items-center gap-4 numeric text-[11.5px] text-ink-3">
                      <span>embed {formatMs(run.embed_ms ?? 0)}</span>
                      <span>search {formatMs(run.search_ms ?? 0)}</span>
                      <span className="text-ink-2">
                        {formatMs(run.total_ms ?? 0)} total
                      </span>
                    </span>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    {[
                      { label: "top", value: top.toFixed(3) },
                      {
                        label: "mean",
                        value: (run.metrics?.mean_score ?? 0).toFixed(3),
                      },
                      {
                        label: "spread",
                        value: (run.metrics?.spread ?? 0).toFixed(3),
                      },
                      {
                        label: "coverage",
                        value: `${Math.round((run.coverage ?? 0) * 100)}%`,
                      },
                    ].map((metric) => (
                      <div key={metric.label}>
                        <p className="eyebrow">{metric.label}</p>
                        <p className="mt-1.5 numeric text-[15px] text-ink-2">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {run.top_sources && run.top_sources.length > 0 && (
                    <ol className="mt-4 space-y-2 border-t border-line-soft pt-4">
                      {run.top_sources.map((source, i) => (
                        <li key={i} className="flex gap-3 text-[12px]">
                          <ScoreDot score={source.score} />
                          <span className="min-w-0 flex-1">
                            <span className="text-ink-2">
                              {source.filename}
                            </span>
                            <span className="mt-0.5 block leading-relaxed text-ink-3">
                              {source.excerpt}…
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}

            <p className="pt-2 text-[12px] leading-relaxed text-ink-3">
              Cosine scores are only comparable within a dimension, not across
              them — a 2048d score of 0.61 is not &ldquo;better&rdquo; than a
              384d score of 0.58. What matters is whether the ranking changes:
              if the same chunks come back on top at every width, the narrower
              index is doing the same job for less storage and latency.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
