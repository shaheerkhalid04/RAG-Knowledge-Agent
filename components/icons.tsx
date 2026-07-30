type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function AskIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9z" />
      <path d="M18.5 16.5 19.2 18.6 21.3 19.3 19.2 20 18.5 22.1 17.8 20 15.7 19.3 17.8 18.6z" />
    </svg>
  );
}

export function SourcesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7.2 12 3.5l8 3.7-8 3.7z" />
      <path d="M4 12l8 3.7 8-3.7" />
      <path d="M4 16.8l8 3.7 8-3.7" />
    </svg>
  );
}

export function InsightsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-5.5" />
      <path d="M12.7 20V9.5" />
      <path d="M17.3 20v-8" />
    </svg>
  );
}

export function LabIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9.5 3.5v5.2L4.8 17a2.4 2.4 0 0 0 2.1 3.5h10.2a2.4 2.4 0 0 0 2.1-3.5l-4.7-8.3V3.5" />
      <path d="M8.4 3.5h7.2" />
      <path d="M7.4 14.4h9.2" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 15.5V4.2" />
      <path d="m7.8 8.4 4.2-4.2 4.2 4.2" />
      <path d="M4.5 15v3.4a1.6 1.6 0 0 0 1.6 1.6h11.8a1.6 1.6 0 0 0 1.6-1.6V15" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.8 6.6h14.4" />
      <path d="M9.6 6.6V4.8h4.8v1.8" />
      <path d="M6.6 6.6 7.4 19a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3l.8-12.4" />
      <path d="M10.4 10.2v6.2M13.6 10.2v6.2" />
    </svg>
  );
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m8.5 5.5 7 6.5-7 6.5" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4.2 11.9 20 4.4l-7.5 15.8-1.9-6.4z" />
      <path d="m10.6 13.8 9.4-9.4" />
    </svg>
  );
}
