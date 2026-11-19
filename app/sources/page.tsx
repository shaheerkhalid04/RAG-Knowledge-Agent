"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { TrashIcon, UploadIcon } from "@/components/icons";
import { Notice, PageHeader, Spinner, Stat } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { AdminToken } from "@/components/admin-token";
import { api, formatBytes, formatMs, formatWhen } from "@/lib/api";
import type { IngestResult } from "@/lib/types";

type Pending = { name: string; state: "queued" | "working" | "failed"; detail?: string };

export default function SourcesPage() {
  const {
    health,
    dimension,
    documents,
    totalChunks,
    vectorCount,
    loadingDocuments,
    refreshDocuments,
    error,
  } = useWorkspace();

  const [pending, setPending] = useState<Pending[]>([]);
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const extensions = useMemo(
    () => health?.supported_extensions ?? [".pdf", ".docx", ".txt", ".md"],
    [health],
  );
  const maxBytes = health?.max_upload_bytes ?? 4 * 1024 * 1024;

  const ingest = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      setPending(files.map((file) => ({ name: file.name, state: "queued" })));

      // Sequential on purpose: each upload also does the embedding round trip,
      // and firing them together trips Pinecone's inference rate limit.
      for (const file of files) {
        const mark = (state: Pending["state"], detail?: string) =>
          setPending((current) =>
            current.map((item) =>
              item.name === file.name ? { ...item, state, detail } : item,
            ),
          );

        const dot = file.name.lastIndexOf(".");
        const ext = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
        if (!extensions.includes(ext)) {
          mark("failed", `${ext || "This file type"} is not supported`);
          continue;
        }
        if (file.size > maxBytes) {
          mark(
            "failed",
            `${formatBytes(file.size)} exceeds the ${formatBytes(maxBytes)} limit`,
          );
          continue;
        }

        mark("working");
        try {
          const result = await api.upload(file, dimension);
          setLastIngest(result);
          setPending((current) =>
            current.filter((item) => item.name !== file.name),
          );
        } catch (err) {
          mark("failed", (err as Error).message);
        }
      }

      refreshDocuments();
    },
    [dimension, extensions, maxBytes, refreshDocuments],
  );

  const remove = useCallback(
    async (id: string) => {
      setRemoving(id);
      setConfirming(null);
      try {
        await api.removeDocument(id, dimension);
        refreshDocuments();
      } catch (err) {
        setPending((current) => [
          ...current,
          { name: id, state: "failed", detail: (err as Error).message },
        ]);
      } finally {
        setRemoving(null);
      }
    },
    [dimension, refreshDocuments],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:px-10">
      <PageHeader
        eyebrow={`${dimension} dimensions`}
        title="Sources"
        lede="Everything the assistant is allowed to know. Add a file and it is chunked, embedded and indexed immediately; remove one and its vectors leave the index with it."
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Documents"
          value={loadingDocuments ? "—" : String(documents.length)}
        />
        <Stat
          label="Chunks"
          value={loadingDocuments ? "—" : totalChunks.toLocaleString()}
          sub="Retrievable passages"
        />
        <Stat
          label="Vectors in index"
          value={loadingDocuments ? "—" : vectorCount.toLocaleString()}
          sub={`${dimension}-dimensional`}
        />
      </div>

      <AdminToken />

      {error && (
        <div className="mt-6">
          <Notice tone="rust">{error}</Notice>
        </div>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void ingest(Array.from(event.dataTransfer.files));
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.current?.click();
          }
        }}
        className={`mt-6 cursor-pointer rounded-xl border border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? "border-brass bg-brass/6"
            : "border-line hover:border-brass-dim hover:bg-veil/50"
        }`}
      >
        <UploadIcon
          className={`mx-auto size-6 transition-colors ${dragging ? "text-brass" : "text-ink-3"}`}
        />
        <p className="mt-4 text-[14px] text-ink-2">
          Drop files here, or click to browse
        </p>
        <p className="mt-1.5 numeric text-[11.5px] text-ink-3">
          {extensions.join("  ·  ")} — up to {formatBytes(maxBytes)} each
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={extensions.join(",")}
          className="hidden"
          onChange={(event) => {
            void ingest(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pending.map((item) => (
            <li
              key={item.name}
              className={`panel flex items-center gap-3 px-4 py-3 text-[12.5px] ${
                item.state === "failed" ? "border-rust/30" : ""
              }`}
            >
              {item.state === "working" ? (
                <Spinner className="size-3.5 shrink-0 text-brass" />
              ) : (
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    item.state === "failed"
                      ? "bg-rust"
                      : "animate-pulse-soft bg-ink-3"
                  }`}
                />
              )}
              <span className="min-w-0 truncate text-ink-2">{item.name}</span>
              <span
                className={`ml-auto shrink-0 text-[11.5px] ${
                  item.state === "failed" ? "text-rust" : "text-ink-3"
                }`}
              >
                {item.detail ??
                  (item.state === "working" ? "Embedding…" : "Queued")}
              </span>
              {item.state === "failed" && (
                <button
                  type="button"
                  onClick={() =>
                    setPending((current) =>
                      current.filter((entry) => entry.name !== item.name),
                    )
                  }
                  className="shrink-0 text-ink-3 transition-colors hover:text-ink"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {lastIngest && (
        <p className="mt-4 numeric text-[11.5px] text-ink-3">
          Indexed <span className="text-ink-2">{lastIngest.filename}</span> —{" "}
          {lastIngest.chunks} chunks from{" "}
          {lastIngest.words.toLocaleString()} words in{" "}
          {formatMs(lastIngest.timings.total_ms)} (embedding{" "}
          {formatMs(lastIngest.timings.embed_ms)})
        </p>
      )}

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-line-soft pb-3">
          <h2 className="font-display text-[20px] text-ink">In the index</h2>
          <button
            type="button"
            onClick={refreshDocuments}
            className="text-[12px] text-ink-3 transition-colors hover:text-ink-2"
          >
            Refresh
          </button>
        </div>

        {loadingDocuments ? (
          <div className="flex items-center gap-2.5 py-10 text-[13px] text-ink-3">
            <Spinner className="size-3.5" /> Reading the index…
          </div>
        ) : documents.length === 0 ? (
          <p className="py-10 text-[13.5px] text-ink-3">
            Nothing indexed at {dimension} dimensions yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {documents.map((document) => {
              const open = expanded === document.id;
              return (
                <li key={document.id} className="group py-4">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : document.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-[14px] text-ink transition-colors group-hover:text-brass">
                        {document.filename}
                      </p>
                      <p className="mt-1 numeric text-[11.5px] text-ink-3">
                        {document.chunks} chunks ·{" "}
                        {document.words.toLocaleString()} words ·{" "}
                        {formatBytes(document.size_bytes)} ·{" "}
                        {formatWhen(document.uploaded_at)}
                      </p>
                    </button>

                    {confirming === document.id ? (
                      <span className="flex shrink-0 items-center gap-2 text-[12px]">
                        <span className="text-ink-3">Delete?</span>
                        <button
                          type="button"
                          onClick={() => void remove(document.id)}
                          className="rounded-md border border-rust/40 bg-rust/10 px-2.5 py-1 text-rust transition-colors hover:bg-rust/20"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="px-1 text-ink-3 transition-colors hover:text-ink-2"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(document.id)}
                        disabled={removing === document.id}
                        aria-label={`Delete ${document.filename}`}
                        className="shrink-0 rounded-md p-2 text-ink-3 opacity-0 transition-all hover:bg-rust/10 hover:text-rust focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
                      >
                        {removing === document.id ? (
                          <Spinner className="size-4" />
                        ) : (
                          <TrashIcon className="size-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {open && (
                    <p className="animate-fade mt-3 rounded-lg border border-line-soft bg-veil/60 px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
                      {document.preview}
                      {document.characters > document.preview.length && "…"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
