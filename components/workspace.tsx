"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "@/lib/api";
import type { DocumentRecord, Health } from "@/lib/types";

const DIMENSION_KEY = "rag.dimension";

type WorkspaceValue = {
  health: Health | null;
  ready: boolean;
  dimension: number;
  setDimension: (value: number) => void;
  documents: DocumentRecord[];
  totalChunks: number;
  vectorCount: number;
  loadingDocuments: boolean;
  refreshDocuments: () => void;
  error: string | null;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <Workspace>");
  return value;
}

export function Workspace({ children }: { children: React.ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [ready, setReady] = useState(false);
  const [dimension, setDimensionState] = useState(1024);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [vectorCount, setVectorCount] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The stored dimension is only read after mount, so the server and the first
  // client render agree. Both it and the health probe settle in one update.
  useEffect(() => {
    const stored = Number(window.localStorage.getItem(DIMENSION_KEY));

    api
      .health()
      .then((result) => {
        setHealth(result);
        setDimensionState(stored || result.default_dimension);
        if (result.missing_credentials.length) {
          setError(
            `Missing ${result.missing_credentials.join(" and ")}. Add the key(s) and reload.`,
          );
        } else if (result.detail) {
          setError(result.detail);
        }
      })
      .catch((err: Error) => {
        if (stored) setDimensionState(stored);
        setError(err.message);
      })
      .finally(() => setReady(true));
  }, []);

  const setDimension = useCallback((value: number) => {
    setDimensionState(value);
    window.localStorage.setItem(DIMENSION_KEY, String(value));
  }, []);

  const refreshDocuments = useCallback(() => setNonce((n) => n + 1), []);

  const blocked = Boolean(health?.missing_credentials.length);
  const request = `${dimension}:${nonce}`;

  // Loading is derived from "which request has settled" rather than being
  // toggled in an effect, so switching dimension shows a loading state without
  // an extra synchronous render pass.
  const loadingDocuments = ready && !blocked && settled !== request;

  useEffect(() => {
    if (!ready || blocked) return;

    let cancelled = false;
    api
      .documents(dimension)
      .then((result) => {
        if (cancelled) return;
        setDocuments(result.documents);
        setTotalChunks(result.total_chunks);
        setVectorCount(result.vector_count);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setDocuments([]);
        setTotalChunks(0);
        setVectorCount(0);
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setSettled(request);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, blocked, dimension, request]);

  const value = useMemo(
    () => ({
      health,
      ready,
      dimension,
      setDimension,
      documents,
      totalChunks,
      vectorCount,
      loadingDocuments,
      refreshDocuments,
      error,
    }),
    [
      health,
      ready,
      dimension,
      setDimension,
      documents,
      totalChunks,
      vectorCount,
      loadingDocuments,
      refreshDocuments,
      error,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
