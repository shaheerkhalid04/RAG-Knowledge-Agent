"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AskIcon, InsightsIcon, LabIcon, SourcesIcon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace";

const LINKS = [
  { href: "/", label: "Ask", hint: "Query the archive", Icon: AskIcon },
  {
    href: "/sources",
    label: "Sources",
    hint: "Manage documents",
    Icon: SourcesIcon,
  },
  {
    href: "/insights",
    label: "Insights",
    hint: "Latency & quality",
    Icon: InsightsIcon,
  },
  { href: "/lab", label: "Lab", hint: "Compare dimensions", Icon: LabIcon },
];

export function Rail() {
  const pathname = usePathname();
  const { health, dimension, setDimension, documents, totalChunks, error } =
    useWorkspace();

  const online = Boolean(health?.ok);
  const dimensions = health?.supported_dimensions ?? [384, 512, 768, 1024, 2048];

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-16 flex-col border-r border-line-soft bg-canvas/80 backdrop-blur-xl md:w-60">
      <div className="flex h-20 shrink-0 items-center gap-3 px-4 md:px-6">
        <span className="relative grid size-8 shrink-0 place-items-center rounded-md border border-brass-dim/50 bg-brass/8">
          <span className="font-display text-[15px] leading-none text-brass">
            A
          </span>
        </span>
        <span className="hidden md:block">
          <span className="block font-display text-[19px] leading-none tracking-tight">
            Archivist
          </span>
          <span className="eyebrow mt-1 block">Adaptive RAG</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 md:px-3">
        {LINKS.map(({ href, label, hint, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                active
                  ? "bg-raised/70 text-ink"
                  : "text-ink-3 hover:bg-raised/40 hover:text-ink-2"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 h-5 w-px -translate-y-1/2 rounded-full bg-brass transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <Icon className="size-[18px] shrink-0" />
              <span className="hidden min-w-0 md:block">
                <span className="block text-[13.5px] leading-tight">
                  {label}
                </span>
                <span className="block truncate text-[11px] leading-tight text-ink-3">
                  {hint}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden shrink-0 flex-col gap-3 border-t border-line-soft p-4 md:flex">
        <label className="block">
          <span className="eyebrow">Index</span>
          <div className="mt-1.5 flex items-center gap-2">
            <select
              value={dimension}
              onChange={(event) => setDimension(Number(event.target.value))}
              className="w-full cursor-pointer appearance-none rounded-md border border-line-soft bg-raised/60 px-2.5 py-1.5 numeric text-[12.5px] text-ink-2 transition-colors hover:border-line hover:text-ink"
            >
              {dimensions.map((value) => (
                <option key={value} value={value}>
                  {value} dimensions
                </option>
              ))}
            </select>
          </div>
        </label>

        <div className="flex items-center justify-between numeric text-[11px] text-ink-3">
          <span>
            {documents.length} doc{documents.length === 1 ? "" : "s"}
          </span>
          <span>{totalChunks.toLocaleString()} chunks</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span
            className={`size-1.5 rounded-full ${
              error
                ? "bg-rust"
                : online
                  ? "bg-sage"
                  : "animate-pulse-soft bg-ink-3"
            }`}
          />
          <span className="truncate">
            {error ? "Not connected" : online ? "Connected" : "Connecting…"}
          </span>
        </div>
      </div>
    </aside>
  );
}
