import type {
  DocumentList,
  Health,
  IngestResult,
  Insights,
  LabComparison,
  LogEntry,
  QueryResult,
  ReindexResult,
} from "./types";

const BASE = "/api/py";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError(
      "Could not reach the API. Is the Python server running?",
      0,
    );
  }

  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    // Non-JSON body — surface the raw text below.
  }

  if (!response.ok) {
    const detail =
      (parsed as { detail?: unknown })?.detail ?? body ?? response.statusText;
    throw new ApiError(
      typeof detail === "string" ? detail : JSON.stringify(detail),
      response.status,
    );
  }

  return parsed as T;
}

export const api = {
  health: () => request<Health>("/health"),

  documents: (dimension: number) =>
    request<DocumentList>(`/documents?dimension=${dimension}`),

  upload: (file: File, dimension: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("dimension", String(dimension));
    return request<IngestResult>("/documents", { method: "POST", body: form });
  },

  removeDocument: (id: string, dimension: number) =>
    request<{ removed_chunks: number }>(
      `/documents/${id}?dimension=${dimension}`,
      { method: "DELETE" },
    ),

  query: (payload: {
    query: string;
    dimension: number;
    top_k: number;
    audit: boolean;
  }) =>
    request<QueryResult>("/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),

  insights: (dimension: number) =>
    request<Insights>(`/insights?dimension=${dimension}`),

  logs: (dimension: number, limit = 50) =>
    request<{ logs: LogEntry[] }>(`/logs?dimension=${dimension}&limit=${limit}`),

  clearLogs: (dimension: number) =>
    request<{ removed: number }>(`/logs?dimension=${dimension}`, {
      method: "DELETE",
    }),

  compare: (payload: {
    query: string;
    top_k: number;
    dimensions?: number[];
  }) =>
    request<LabComparison>("/lab/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),

  reindex: (source: number, target: number) =>
    request<ReindexResult>("/lab/reindex", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, target }),
    }),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatWhen(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
