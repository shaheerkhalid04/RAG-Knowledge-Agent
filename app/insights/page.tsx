"use client";

import { useCallback, useEffect, useState } from "react";

import { Empty, Meter, Notice, PageHeader, Spinner, Stat } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { api, formatMs, formatWhen } from "@/lib/api";
import type { Insights } from "@/lib/types";

const STAGES = [
  { key: "embed_ms", label: "Embed", className: "bg-brass-dim" },
  { key: "retrieve_ms", label: "Retrieve", className: "bg-brass" },
  { key: "generate_ms", label: "Generate", className: "bg-sage" },
] as const;

export default function InsightsPage() {
  const { dimension } = useWorkspace();

  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Bumping the nonce re-runs the fetch; every state write happens in an async
  // callback, and an in-flight request is ignored once the dimension changes.
  useEffect(() => {
    let cancelled = false;
    api
      .insights(dimension)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dimension, nonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((value) => value + 1);
  }, []);

  const clear = useCallback(async () => {
    setClearing(true);
    try {
      await api.clearLogs(dimension);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClearing(false);
    }
  }, [dimension, reload]);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:px-10">
      <PageHeader
        eyebrow={`${dimension} dimensions`}
        title="Insights"
        lede="Every query is logged with its stage timings and quality scores, so you can see what adding or removing a document actually did to retrieval."
      >
        <button
          type="button"
          onClick={reload}
          className="rounded-lg border border-line-soft px-3 py-1.5 text-[12px] text-ink-3 transition-colors hover:border-line hover:text-ink-2"
        >
          Refresh
        </button>
        {data && !data.empty && (
          <button
            type="button"
            onClick={() => void clear()}
            disabled={clearing}
            className="rounded-lg border border-line-soft px-3 py-1.5 text-[12px] text-ink-3 transition-colors hover:border-rust/40 hover:text-rust disabled:opacity-50"
          >
            {clearing ? "Clearing…" : "Clear log"}
          </button>
        )}
      </PageHeader>

      {error && (
        <div className="mt-8">
          <Notice tone="rust">{error}</Notice>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2.5 py-16 text-[13px] text-ink-3">
          <Spinner className="size-3.5" /> Reading the query log…
        </div>
      ) : !data || data.empty ? (
        <div className="mt-8">
          <Empty
            title="No queries logged yet"
            body="Ask something on the Ask page. Each query records its latency breakdown, retrieval scores and grounding, and this dashboard fills in."
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Queries logged" value={data.queries.toLocaleString()} />
            <Stat
              label="Median latency"
              value={formatMs(data.latency.p50_ms)}
              sub={`p95 ${formatMs(data.latency.p95_ms)}`}
              tone="brass"
            />
            <Stat
              label="Mean grounding"
              value={`${Math.round(data.quality.mean_grounding * 100)}%`}
              sub="Answer words traceable to context"
              tone={data.quality.mean_grounding >= 0.6 ? "sage" : "amber"}
            />
            <Stat
              label="Weak retrievals"
              value={String(data.quality.weak_retrievals)}
              sub="Top match below 0.35"
              tone={data.quality.weak_retrievals ? "rust" : "sage"}
            />
          </div>

          <section className="mt-12">
            <h2 className="font-display text-[20px] text-ink">
              Where the time goes
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
              Mean milliseconds per stage across {data.queries} quer
              {data.queries === 1 ? "y" : "ies"}. Which stage dominates depends
              on where you are relative to the Pinecone region — network
              round-trips often cost more than the model does.
            </p>

            <div className="panel mt-5 px-5 py-5">
              <div className="flex h-2 overflow-hidden rounded-full bg-raised">
                {STAGES.map((stage) => {
                  const total =
                    STAGES.reduce(
                      (sum, item) => sum + data.stage_share[item.key],
                      0,
                    ) || 1;
                  return (
                    <div
                      key={stage.key}
                      className={stage.className}
                      style={{
                        width: `${(data.stage_share[stage.key] / total) * 100}%`,
                      }}
                    />
                  );
                })}
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-4">
                {STAGES.map((stage) => (
                  <div key={stage.key}>
                    <dt className="flex items-center gap-2 text-[12px] text-ink-3">
                      <span
                        className={`size-1.5 rounded-full ${stage.className}`}
                      />
                      {stage.label}
                    </dt>
                    <dd className="mt-1.5 numeric text-[16px] text-ink">
                      {formatMs(data.stage_share[stage.key])}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 border-t border-line-soft pt-4 numeric text-[11.5px] text-ink-3">
                fastest {formatMs(data.latency.fastest_ms)} · mean{" "}
                {formatMs(data.latency.mean_ms)} · slowest{" "}
                {formatMs(data.latency.slowest_ms)}
              </p>
            </div>
          </section>

          <section className="mt-12 grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-[20px] text-ink">
                Answer quality
              </h2>
              <div className="panel mt-5 space-y-5 px-5 py-5">
                <Meter
                  label="Mean grounding"
                  value={data.quality.mean_grounding}
                  display={`${Math.round(data.quality.mean_grounding * 100)}%`}
                  tone={data.quality.mean_grounding >= 0.6 ? "sage" : "amber"}
                />
                <Meter
                  label="Mean query coverage"
                  value={data.quality.mean_coverage}
                  display={`${Math.round(data.quality.mean_coverage * 100)}%`}
                  tone={data.quality.mean_coverage >= 0.5 ? "sage" : "amber"}
                />
                <Meter
                  label="Mean top similarity"
                  value={data.quality.mean_top_score}
                  display={data.quality.mean_top_score.toFixed(3)}
                  tone={data.quality.mean_top_score >= 0.5 ? "sage" : "amber"}
                />
                <div className="border-t border-line-soft pt-4 text-[12px] text-ink-3">
                  {data.quality.uncited_answers === 0 ? (
                    <span className="text-sage">
                      Every logged answer cited at least one source.
                    </span>
                  ) : (
                    <span className="text-amber">
                      {data.quality.uncited_answers} answer
                      {data.quality.uncited_answers === 1 ? "" : "s"} cited no
                      source at all — usually a sign the retrieved context did
                      not contain the answer.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h2 className="font-display text-[20px] text-ink">
                Second-model audit
              </h2>
              <div className="panel mt-5 px-5 py-5">
                {data.audit.count === 0 ? (
                  <p className="text-[13px] leading-relaxed text-ink-3">
                    No audited queries yet. Turn on{" "}
                    <span className="text-ink-2">Audit</span> in the composer to
                    have a second model check each answer against its sources
                    and flag unsupported claims.
                  </p>
                ) : (
                  <div className="space-y-5">
                    <Meter
                      label="Groundedness"
                      value={data.audit.mean_groundedness}
                      max={100}
                      display={`${Math.round(data.audit.mean_groundedness)} / 100`}
                      tone={
                        data.audit.mean_groundedness >= 70 ? "sage" : "rust"
                      }
                    />
                    <Meter
                      label="Relevance"
                      value={data.audit.mean_relevance}
                      max={100}
                      display={`${Math.round(data.audit.mean_relevance)} / 100`}
                      tone={data.audit.mean_relevance >= 70 ? "sage" : "rust"}
                    />
                    <p className="border-t border-line-soft pt-4 numeric text-[11.5px] text-ink-3">
                      across {data.audit.count} audited quer
                      {data.audit.count === 1 ? "y" : "ies"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {data.documents.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-[20px] text-ink">
                Which documents earn their place
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
                How often each document surfaced in a top-k result, and how
                strongly it matched when it did. A document that never appears is
                a candidate for removal.
              </p>
              <div className="panel mt-5 space-y-4 px-5 py-5">
                {data.documents.map((document) => (
                  <Meter
                    key={document.filename}
                    label={document.filename}
                    value={document.hits}
                    max={data.documents[0].hits}
                    display={`${document.hits} hits · ${document.mean_score.toFixed(3)}`}
                    tone="brass"
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mt-12">
            <h2 className="font-display text-[20px] text-ink">Recent queries</h2>
            <ul className="mt-5 divide-y divide-line-soft">
              {data.recent.map((entry) => (
                <li key={entry.id} className="flex items-center gap-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink-2">
                      {entry.query}
                    </p>
                    <p className="mt-1 numeric text-[11px] text-ink-3">
                      {formatWhen(entry.ts)} · {entry.sources.length} chunks ·
                      top {entry.metrics.retrieval.top_score.toFixed(3)} ·
                      grounding {Math.round(entry.metrics.grounding * 100)}%
                    </p>
                  </div>
                  <span className="shrink-0 numeric text-[12px] text-ink-3">
                    {formatMs(entry.timings.total_ms)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
