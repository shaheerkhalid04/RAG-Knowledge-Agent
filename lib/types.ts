export type Health = {
  ok: boolean;
  missing_credentials: string[];
  embed_model: string;
  chat_model: string;
  judge_model: string;
  default_dimension: number;
  supported_dimensions: number[];
  max_upload_bytes: number;
  supported_extensions: string[];
  indexed_dimensions: number[];
  detail?: string;
};

export type DocumentRecord = {
  id: string;
  filename: string;
  size_bytes: number;
  chunks: number;
  characters: number;
  words: number;
  uploaded_at: number;
  preview: string;
  dimension: number;
};

export type DocumentList = {
  documents: DocumentRecord[];
  dimension: number;
  total_chunks: number;
  vector_count: number;
};

export type IngestResult = {
  id: string;
  filename: string;
  chunks: number;
  characters: number;
  words: number;
  size_bytes: number;
  dimension: number;
  timings: {
    extract_ms: number;
    embed_ms: number;
    upsert_ms: number;
    total_ms: number;
  };
};

export type Source = {
  id: string;
  score: number;
  text: string;
  filename: string;
  doc_id: string;
  chunk_index: number;
};

export type RetrievalMetrics = {
  top_score: number;
  mean_score: number;
  spread: number;
  above_threshold: number;
  retrieved: number;
  documents: number;
};

export type Metrics = {
  retrieval: RetrievalMetrics;
  coverage: number;
  grounding: number;
  citations: {
    cited: number[];
    dangling: number[];
    count: number;
    unused: number;
  };
};

export type Timings = {
  embed_ms: number;
  retrieve_ms: number;
  generate_ms: number;
  judge_ms: number;
  total_ms: number;
};

export type Judge = {
  groundedness: number;
  relevance: number;
  unsupported_claims: string[];
};

export type QueryResult = {
  query: string;
  answer: string;
  sources: Source[];
  metrics: Metrics;
  judge: Judge | null;
  timings: Timings;
  dimension: number;
  top_k: number;
  model: string;
  ts: number;
  log_id: string | null;
};

export type LogEntry = Omit<QueryResult, "sources"> & {
  id: string;
  sources: Pick<Source, "filename" | "score" | "doc_id" | "chunk_index">[];
};

export type Insights =
  | { dimension: number; queries: 0; empty: true }
  | {
      dimension: number;
      empty: false;
      queries: number;
      latency: {
        mean_ms: number;
        p50_ms: number;
        p95_ms: number;
        fastest_ms: number;
        slowest_ms: number;
      };
      stage_share: {
        embed_ms: number;
        retrieve_ms: number;
        generate_ms: number;
      };
      quality: {
        mean_grounding: number;
        mean_coverage: number;
        mean_top_score: number;
        weak_retrievals: number;
        uncited_answers: number;
      };
      audit: {
        count: number;
        mean_groundedness: number;
        mean_relevance: number;
      };
      documents: { filename: string; hits: number; mean_score: number }[];
      recent: LogEntry[];
    };

export type LabRun = {
  dimension: number;
  available: boolean;
  chunks?: number;
  embed_ms?: number;
  search_ms?: number;
  total_ms?: number;
  metrics?: RetrievalMetrics;
  coverage?: number;
  top_sources?: { filename: string; score: number; excerpt: string }[];
};

export type LabComparison = {
  query: string;
  top_k: number;
  runs: LabRun[];
};

export type ReindexResult = {
  source: number;
  target: number;
  chunks_copied: number;
  truncated: boolean;
  elapsed_ms: number;
};
