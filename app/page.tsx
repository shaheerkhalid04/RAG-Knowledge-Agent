"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { ExchangeView, type Exchange } from "@/components/exchange";
import { SendIcon } from "@/components/icons";
import { Notice, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { api } from "@/lib/api";

const OPENERS = [
  "Summarise the key argument in the most recent document.",
  "What does the archive say that contradicts itself?",
  "List every figure, date and named entity you can find.",
  "What question would you need another source to answer?",
];

export default function AskPage() {
  const { dimension, documents, loadingDocuments, error } = useWorkspace();

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [input, setInput] = useState("");
  const [topK, setTopK] = useState(5);
  const [audit, setAudit] = useState(false);
  const [busy, setBusy] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const key = `${Date.now()}`;
      setExchanges((current) => [
        ...current,
        { key, query: trimmed, result: null, error: null },
      ]);
      setInput("");
      setBusy(true);
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      );

      try {
        const result = await api.query({
          query: trimmed,
          dimension,
          top_k: topK,
          audit,
        });
        setExchanges((current) =>
          current.map((item) => (item.key === key ? { ...item, result } : item)),
        );
      } catch (err) {
        setExchanges((current) =>
          current.map((item) =>
            item.key === key
              ? { ...item, error: (err as Error).message }
              : item,
          ),
        );
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [audit, busy, dimension, topK],
  );

  const empty = exchanges.length === 0;
  const noDocuments = !loadingDocuments && documents.length === 0 && !error;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 lg:px-10">
      <div className="flex-1 pt-16 pb-8">
        {empty ? (
          <div className="animate-rise pt-10">
            <p className="eyebrow">
              {documents.length} document{documents.length === 1 ? "" : "s"} ·{" "}
              {dimension} dimensions
            </p>
            <h1 className="mt-4 max-w-lg font-display text-[46px] leading-[1.05] tracking-tight text-ink">
              Ask your archive.
            </h1>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-3">
              Every answer is assembled only from documents you have added, cited
              back to the exact chunk it came from, and scored for how well it
              stayed grounded.
            </p>

            {error && (
              <div className="mt-8">
                <Notice tone="rust">{error}</Notice>
              </div>
            )}

            {noDocuments ? (
              <div className="mt-8">
                <Notice>
                  The knowledge base is empty. Add a PDF, DOCX, TXT or Markdown
                  file in{" "}
                  <Link href="/sources" className="underline underline-offset-4">
                    Sources
                  </Link>{" "}
                  to get started.
                </Notice>
              </div>
            ) : (
              <ul className="mt-10 space-y-px">
                {OPENERS.map((opener) => (
                  <li key={opener}>
                    <button
                      type="button"
                      onClick={() => ask(opener)}
                      disabled={busy}
                      className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[13.5px] text-ink-3 transition-colors hover:bg-veil/70 hover:text-ink-2 disabled:opacity-50"
                    >
                      <span className="h-px w-4 shrink-0 bg-line transition-all group-hover:w-6 group-hover:bg-brass-dim" />
                      {opener}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            {exchanges.map((exchange) => (
              <ExchangeView key={exchange.key} exchange={exchange} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 -mx-6 bg-gradient-to-t from-canvas via-canvas to-transparent px-6 pt-6 pb-6 lg:-mx-10 lg:px-10">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(input);
          }}
          className="panel overflow-hidden bg-veil/95 backdrop-blur-xl transition-colors focus-within:border-line"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(input);
              }
            }}
            rows={1}
            placeholder="Ask anything grounded in your documents…"
            className="max-h-44 w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[14.5px] leading-relaxed placeholder:text-ink-3/70 focus:outline-none"
          />

          <div className="flex items-center gap-2 px-3 pb-3">
            <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] text-ink-3">
              <span>top-k</span>
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
              type="button"
              onClick={() => setAudit((value) => !value)}
              title="Run a second model over the answer to check it against the sources"
              className={`rounded-md border px-2.5 py-1.5 text-[11.5px] transition-colors ${
                audit
                  ? "border-brass-dim/60 bg-brass/10 text-brass"
                  : "border-line-soft text-ink-3 hover:text-ink-2"
              }`}
            >
              Audit
            </button>

            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="ml-auto flex size-9 items-center justify-center rounded-lg bg-brass text-canvas transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-25"
              aria-label="Send question"
            >
              {busy ? (
                <Spinner className="size-4" />
              ) : (
                <SendIcon className="size-4" />
              )}
            </button>
          </div>
        </form>

        <p className="mt-2.5 text-center text-[11px] text-ink-3/70">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}
