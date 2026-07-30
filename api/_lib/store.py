"""Vector store operations against Pinecone serverless.

Two constraints from Pinecone serverless shape everything here:

  1. An index has one fixed dimension, so each embedding dimension needs its
     own index. That is what `index_name(dimension)` is for.
  2. Serverless indexes cannot delete by metadata filter - only by ID. So chunk
     IDs are prefixed with their document ID (`{doc_id}#{n}`), which lets us
     list-by-prefix and delete a document's vectors exactly.
"""

import json
import time
import uuid

from . import config
from .pine import client

_ready: set[str] = set()


# --------------------------------------------------------------------------
# Index lifecycle
# --------------------------------------------------------------------------

def ensure_index(dimension: int):
    """Return a handle to the index for `dimension`, creating it if needed."""
    name = config.index_name(dimension)
    pc = client()

    if name not in _ready:
        if not pc.has_index(name):
            from pinecone import ServerlessSpec

            # With no explicit timeout the SDK polls until the index reports
            # ready, which matters because a fresh index rejects writes.
            pc.create_index(
                name=name,
                dimension=dimension,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud=config.PINECONE_CLOUD, region=config.PINECONE_REGION
                ),
            )
        _ready.add(name)

    return pc.Index(name)


def index_exists(dimension: int) -> bool:
    return client().has_index(config.index_name(dimension))


def known_dimensions() -> list[int]:
    """Which dimension indexes actually exist right now."""
    try:
        names = set(client().list_indexes().names())
    except Exception:
        return []
    return [d for d in config.SUPPORTED_DIMENSIONS if config.index_name(d) in names]


# --------------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------------

def new_document_id() -> str:
    return uuid.uuid4().hex[:16]


def store_document(
    *,
    dimension: int,
    doc_id: str,
    filename: str,
    chunks: list[str],
    chunk_vectors: list[list[float]],
    summary_vector: list[float],
    meta: dict,
) -> None:
    index = ensure_index(dimension)

    records = [
        {
            "id": f"{doc_id}#{i}",
            "values": vector,
            "metadata": {
                "doc_id": doc_id,
                "filename": filename,
                "chunk_index": i,
                "text": text,
            },
        }
        for i, (text, vector) in enumerate(zip(chunks, chunk_vectors))
    ]

    # Batch upserts so a large document does not exceed the request size limit.
    for start in range(0, len(records), 100):
        index.upsert(vectors=records[start : start + 100], namespace=config.NS_CHUNKS)

    index.upsert(
        vectors=[{"id": doc_id, "values": summary_vector, "metadata": meta}],
        namespace=config.NS_REGISTRY,
    )


def _all_ids(index, namespace: str, prefix: str | None = None) -> list[str]:
    ids: list[str] = []
    try:
        kwargs = {"namespace": namespace}
        if prefix:
            kwargs["prefix"] = prefix
        for page in index.list(**kwargs):
            ids.extend(page if isinstance(page, list) else [page])
    except Exception:
        # Namespace does not exist yet, or the SDK surfaced a paging error.
        return []
    return ids


def list_documents(dimension: int) -> list[dict]:
    if not index_exists(dimension):
        return []
    index = ensure_index(dimension)

    ids = _all_ids(index, config.NS_REGISTRY)
    if not ids:
        return []

    documents: list[dict] = []
    for start in range(0, len(ids), 100):
        fetched = index.fetch(ids=ids[start : start + 100], namespace=config.NS_REGISTRY)
        vectors = getattr(fetched, "vectors", None) or {}
        for doc_id, record in vectors.items():
            meta = dict(getattr(record, "metadata", None) or {})
            meta["id"] = doc_id
            documents.append(meta)

    documents.sort(key=lambda d: d.get("uploaded_at", 0), reverse=True)
    return documents


def document_chunk_texts(dimension: int, doc_id: str) -> list[str]:
    """Recover a document's chunk text straight from vector metadata.

    This is what lets the Lab re-index a corpus at another dimension without
    asking the user to re-upload anything.
    """
    index = ensure_index(dimension)
    ids = _all_ids(index, config.NS_CHUNKS, prefix=f"{doc_id}#")
    if not ids:
        return []

    ordered: list[tuple[int, str]] = []
    for start in range(0, len(ids), 100):
        fetched = index.fetch(ids=ids[start : start + 100], namespace=config.NS_CHUNKS)
        vectors = getattr(fetched, "vectors", None) or {}
        for record in vectors.values():
            meta = dict(getattr(record, "metadata", None) or {})
            text = meta.get("text", "")
            if text:
                ordered.append((int(meta.get("chunk_index", 0) or 0), text))

    ordered.sort(key=lambda pair: pair[0])
    return [text for _, text in ordered]


def delete_document(dimension: int, doc_id: str) -> int:
    """Remove a document's registry entry and every chunk vector it produced."""
    index = ensure_index(dimension)

    chunk_ids = _all_ids(index, config.NS_CHUNKS, prefix=f"{doc_id}#")
    for start in range(0, len(chunk_ids), 500):
        index.delete(ids=chunk_ids[start : start + 500], namespace=config.NS_CHUNKS)

    index.delete(ids=[doc_id], namespace=config.NS_REGISTRY)
    return len(chunk_ids)


def count_chunks(dimension: int) -> int:
    if not index_exists(dimension):
        return 0
    try:
        stats = ensure_index(dimension).describe_index_stats()
        namespaces = getattr(stats, "namespaces", None) or {}
        chunks = namespaces.get(config.NS_CHUNKS)
        if chunks is None:
            return 0
        return int(getattr(chunks, "vector_count", 0) or 0)
    except Exception:
        return 0


# --------------------------------------------------------------------------
# Retrieval
# --------------------------------------------------------------------------

def search(dimension: int, vector: list[float], top_k: int) -> list[dict]:
    if not index_exists(dimension):
        return []
    index = ensure_index(dimension)
    response = index.query(
        vector=vector,
        top_k=top_k,
        include_metadata=True,
        namespace=config.NS_CHUNKS,
    )
    matches = getattr(response, "matches", None) or []

    results = []
    for match in matches:
        meta = dict(getattr(match, "metadata", None) or {})
        results.append(
            {
                "id": getattr(match, "id", ""),
                "score": float(getattr(match, "score", 0.0) or 0.0),
                "text": meta.get("text", ""),
                "filename": meta.get("filename", "unknown"),
                "doc_id": meta.get("doc_id", ""),
                "chunk_index": int(meta.get("chunk_index", 0) or 0),
            }
        )
    return results


# --------------------------------------------------------------------------
# Query log
# --------------------------------------------------------------------------
# Logs live in their own namespace, keyed by the query embedding we already
# computed. Storing them as vectors costs nothing extra and means past queries
# are themselves semantically searchable.

_LOG_LIMIT = 250


def log_query(dimension: int, vector: list[float], payload: dict) -> str:
    log_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
    body = json.dumps(payload)[:38000]  # Pinecone caps metadata at 40 KB/record
    ensure_index(dimension).upsert(
        vectors=[
            {
                "id": log_id,
                "values": vector,
                "metadata": {
                    "ts": payload.get("ts", 0),
                    "total_ms": payload.get("timings", {}).get("total_ms", 0),
                    "payload": body,
                },
            }
        ],
        namespace=config.NS_LOGS,
    )
    return log_id


def read_logs(dimension: int, limit: int = _LOG_LIMIT) -> list[dict]:
    if not index_exists(dimension):
        return []
    index = ensure_index(dimension)

    ids = _all_ids(index, config.NS_LOGS)
    if not ids:
        return []
    # IDs lead with a millisecond timestamp, so this puts newest first.
    ids.sort(reverse=True)
    ids = ids[:limit]

    logs: list[dict] = []
    for start in range(0, len(ids), 100):
        fetched = index.fetch(ids=ids[start : start + 100], namespace=config.NS_LOGS)
        vectors = getattr(fetched, "vectors", None) or {}
        for log_id, record in vectors.items():
            meta = dict(getattr(record, "metadata", None) or {})
            try:
                payload = json.loads(meta.get("payload", "{}"))
            except json.JSONDecodeError:
                continue
            payload["id"] = log_id
            logs.append(payload)

    logs.sort(key=lambda entry: entry.get("ts", 0), reverse=True)
    return logs


def clear_logs(dimension: int) -> int:
    if not index_exists(dimension):
        return 0
    index = ensure_index(dimension)
    ids = _all_ids(index, config.NS_LOGS)
    for start in range(0, len(ids), 500):
        index.delete(ids=ids[start : start + 500], namespace=config.NS_LOGS)
    return len(ids)
