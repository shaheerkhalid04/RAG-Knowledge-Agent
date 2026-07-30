"use client";

type Tone = "brass" | "sage" | "amber" | "rust" | "neutral";

const BAR_TONE: Record<Tone, string> = {
  brass: "bg-brass",
  sage: "bg-sage",
  amber: "bg-amber",
  rust: "bg-rust",
  neutral: "bg-ink-3",
};

const TEXT_TONE: Record<Tone, string> = {
  brass: "text-brass",
  sage: "text-sage",
  amber: "text-amber",
  rust: "text-rust",
  neutral: "text-ink",
};

export function PageHeader({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line-soft pb-8">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2.5 font-display text-[34px] leading-none tracking-tight text-ink">
          {title}
        </h1>
        {lede && (
          <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-3">
            {lede}
          </p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 numeric text-[21px] leading-none ${TEXT_TONE[tone]}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

export function Meter({
  label,
  value,
  max = 1,
  display,
  tone = "brass",
}: {
  label: string;
  value: number;
  max?: number;
  display?: string;
  tone?: Tone;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12.5px] text-ink-2">{label}</span>
        <span className={`numeric text-[12px] ${TEXT_TONE[tone]}`}>
          {display ?? value.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${BAR_TONE[tone]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Notice({
  tone = "amber",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const border =
    tone === "rust"
      ? "border-rust/30 bg-rust/6"
      : tone === "sage"
        ? "border-sage/30 bg-sage/6"
        : "border-amber/30 bg-amber/6";
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-[13px] leading-relaxed ${border} ${TEXT_TONE[tone]}`}
    >
      {children}
    </div>
  );
}

export function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center px-8 py-16 text-center">
      <h2 className="font-display text-[22px] text-ink">{title}</h2>
      <p className="mt-2.5 max-w-sm text-[13.5px] leading-relaxed text-ink-3">
        {body}
      </p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line-soft bg-veil/60 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-[6px] px-3 py-1.5 numeric text-[12px] transition-colors ${
            option.value === value
              ? "bg-raised text-ink"
              : "text-ink-3 hover:text-ink-2"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ScoreDot({ score }: { score: number }) {
  const tone: Tone = score >= 0.55 ? "sage" : score >= 0.35 ? "amber" : "rust";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${BAR_TONE[tone]}`} />
      <span className={`numeric text-[11.5px] ${TEXT_TONE[tone]}`}>
        {score.toFixed(3)}
      </span>
    </span>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.2"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
