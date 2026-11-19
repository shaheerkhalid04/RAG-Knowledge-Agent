"""RAG API — deployed as a single Python serverless function on Vercel.

Every route is namespaced under /api/py/ so it never collides with Next.js
route handlers. next.config.ts proxies that prefix to a local uvicorn during
development and to this function in production.
"""

import hmac
import os
import sys
import time

# Vercel bundles the function with `api/` as the working directory root, so the
# helper package needs to be importable by name.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import Body, Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from _lib import chunking, config, embeddings, evaluate, extract, llm, store
from _lib.pine import MissingCredentials as PineconeCredentials

app = FastAPI(title="RAG Knowledge Agent", docs_url=None, redoc_url=None)


def _dimension(value: int) -> int:
    if value not in config.SUPPORTED_DIMENSIONS:
        raise HTTPException(
            400,
            f"Unsupported dimension {value}. Choose one of {list(config.SUPPORTED_DIMENSIONS)}.",
        )
    return value


def _collection(value: str | None) -> str:
    name = (value or "chunks").strip() or "chunks"
    if name not in config.COLLECTIONS:
        raise HTTPException(400, f"Unknown collection {name!r}. Choose one of {list(config.COLLECTIONS)}.")
    return name


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Every write needs the admin token. Without ADMIN_TOKEN configured, writes are off."""
    if not config.ADMIN_TOKEN:
        raise HTTPException(503, "Writes are disabled: ADMIN_TOKEN is not configured on this deployment.")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, config.ADMIN_TOKEN):
        raise HTTPException(401, "This action needs the admin token.")


@app.exception_handler(PineconeCredentials)
@app.exception_handler(llm.MissingCredentials)
async def _credentials_handler(_request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=503)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/py/health")
def health(verify: bool = Query(False)):
    """Configuration and index status. With ?verify=1 it also makes a real, tiny model call
    and reports { ok, model, latency_ms }, so a retired model shows up as not ok."""
    missing = config.missing_credentials()
    payload = {
        "ok": not missing,
        "model": config.CHAT_MODEL,
        "writes_enabled": bool(config.ADMIN_TOKEN),
        "missing_credentials": missing,
        "embed_model": config.EMBED_MODEL,
        "chat_model": config.CHAT_MODEL,
        "judge_model": config.JUDGE_MODEL,
        "default_dimension": config.DEFAULT_DIMENSION,
        "supported_dimensions": list(config.SUPPORTED_DIMENSIONS),
        "max_upload_bytes": config.MAX_UPLOAD_BYTES,
        "supported_extensions": list(config.SUPPORTED_EXTENSIONS),
        "indexed_dimensions": [],
    }
    if not missing:
        try:
            payload["indexed_dimensions"] = store.known_dimensions()
        except Exception as exc:  # noqa: BLE001
            payload["ok"] = False
            payload["detail"] = str(exc)
    if verify:
        if missing:
            payload["ok"] = False
        else:
            try:
                result = llm.verify()
                payload["latency_ms"] = result["latency_ms"]
            except Exception as exc:  # noqa: BLE001
                payload["ok"] = False
                payload["verify_error"] = type(exc).__name__
                payload["detail"] = str(exc)[:300]
    return payload


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

@app.get("/api/py/documents")
def list_documents(
    dimension: int = Query(config.DEFAULT_DIMENSION),
    collection: str = Query("chunks"),
):
    dim = _dimension(dimension)
    documents = store.list_documents(dim, _collection(collection))
    return {
        "documents": documents,
        "dimension": dim,
        "total_chunks": sum(int(d.get("chunks", 0) or 0) for d in documents),
        "vector_count": store.count_chunks(dim),
    }


@app.post("/api/py/documents", dependencies=[Depends(require_admin)])
async def add_document(
    file: UploadFile = File(...),
    dimension: int = Form(config.DEFAULT_DIMENSION),
    collection: str = Form("chunks"),
):
    dim = _dimension(dimension)
    target = _collection(collection)
    started = time.perf_counter()

    data = await file.read()
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"'{file.filename}' is {len(data) / 1e6:.1f} MB. Vercel caps request bodies "
            f"at {config.MAX_UPLOAD_BYTES / 1e6:.1f} MB — split the document and retry.",
        )

    try:
        text = extract.extract_text(file.filename or "document", data)
    except (extract.UnsupportedFile, extract.EmptyDocument) as exc:
        raise HTTPException(400, str(exc)) from exc

    chunks = chunking.split_text(text, config.CHUNK_SIZE, config.CHUNK_OVERLAP)
    if not chunks:
        raise HTTPException(400, "The document produced no usable chunks.")

    extracted_ms = (time.perf_counter() - started) * 1000

    embed_started = time.perf_counter()
    vectors = embeddings.embed_documents(chunks, dim)
    preview = text[:300]
    summary_vector = embeddings.embed_documents(
        [f"{file.filename}\n\n{preview}"], dim
    )[0]
    embed_ms = (time.perf_counter() - embed_started) * 1000

    doc_id = store.new_document_id()
    upsert_started = time.perf_counter()
    store.store_document(
        collection=target,
        dimension=dim,
        doc_id=doc_id,
        filename=file.filename or "document",
        chunks=chunks,
        chunk_vectors=vectors,
        summary_vector=summary_vector,
        meta={
            "filename": file.filename or "document",
            "size_bytes": len(data),
            "chunks": len(chunks),
            "characters": len(text),
            "words": chunking.word_count(text),
            "uploaded_at": int(time.time() * 1000),
            "preview": preview,
            "dimension": dim,
        },
    )
    upsert_ms = (time.perf_counter() - upsert_started) * 1000

    return {
        "id": doc_id,
        "filename": file.filename,
        "chunks": len(chunks),
        "characters": len(text),
        "words": chunking.word_count(text),
        "size_bytes": len(data),
        "dimension": dim,
        "timings": {
            "extract_ms": round(extracted_ms, 1),
            "embed_ms": round(embed_ms, 1),
            "upsert_ms": round(upsert_ms, 1),
            "total_ms": round((time.perf_counter() - started) * 1000, 1),
        },
    }


@app.delete("/api/py/documents/{doc_id}", dependencies=[Depends(require_admin)])
def remove_document(
    doc_id: str,
    dimension: int = Query(config.DEFAULT_DIMENSION),
    collection: str = Query("chunks"),
):
    dim = _dimension(dimension)
    removed = store.delete_document(dim, doc_id, _collection(collection))
    return {"id": doc_id, "removed_chunks": removed, "dimension": dim}


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

@app.post("/api/py/query")
def run_query(body: dict = Body(...)):
    question = (body.get("query") or "").strip()
    if not question:
        raise HTTPException(400, "A query is required.")

    dim = _dimension(int(body.get("dimension") or config.DEFAULT_DIMENSION))
    top_k = max(1, min(20, int(body.get("top_k") or 5)))
    audit = bool(body.get("audit"))
    # The model is never taken from the request: visitors cannot choose what runs.
    model = config.CHAT_MODEL
    # "namespace" is accepted as an alias so the portfolio can ask the portfolio collection.
    collection = _collection(body.get("collection") or body.get("namespace"))

    started = time.perf_counter()

    embed_started = time.perf_counter()
    query_vector = embeddings.embed_query(question, dim)
    embed_ms = (time.perf_counter() - embed_started) * 1000

    retrieve_started = time.perf_counter()
    chunks = store.search(dim, query_vector, top_k, collection)
    retrieve_ms = (time.perf_counter() - retrieve_started) * 1000

    generate_started = time.perf_counter()
    answer = llm.generate_answer(question, chunks, model)
    generate_ms = (time.perf_counter() - generate_started) * 1000

    metrics = evaluate.summarise(question, answer, chunks)

    judge = None
    judge_ms = 0.0
    if audit and chunks:
        judge_started = time.perf_counter()
        judge = llm.judge_answer(question, answer, chunks)
        judge_ms = (time.perf_counter() - judge_started) * 1000

    total_ms = (time.perf_counter() - started) * 1000
    timings = {
        "embed_ms": round(embed_ms, 1),
        "retrieve_ms": round(retrieve_ms, 1),
        "generate_ms": round(generate_ms, 1),
        "judge_ms": round(judge_ms, 1),
        "total_ms": round(total_ms, 1),
    }

    result = {
        "query": question,
        "answer": answer,
        "sources": chunks,
        "metrics": metrics,
        "judge": judge,
        "timings": timings,
        "dimension": dim,
        "top_k": top_k,
        "model": model,
        "collection": collection,
        "ts": int(time.time() * 1000),
    }

    # Questions asked through the portfolio stay out of the public query log.
    if collection != "chunks":
        result["log_id"] = None
        return result

    try:
        # Logged with a trimmed source list — the dashboard only needs scores.
        record = dict(result)
        record["sources"] = [
            {
                "filename": c["filename"],
                "score": c["score"],
                "doc_id": c["doc_id"],
                "chunk_index": c["chunk_index"],
            }
            for c in chunks
        ]
        record["answer"] = answer[:2000]
        result["log_id"] = store.log_query(dim, query_vector, record)
    except Exception:
        # Logging is observability, not the product. Never fail a query for it.
        result["log_id"] = None

    return result


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

@app.get("/api/py/logs")
def logs(dimension: int = Query(config.DEFAULT_DIMENSION), limit: int = Query(50)):
    dim = _dimension(dimension)
    return {"logs": store.read_logs(dim)[: max(1, min(250, limit))], "dimension": dim}


@app.delete("/api/py/logs", dependencies=[Depends(require_admin)])
def wipe_logs(dimension: int = Query(config.DEFAULT_DIMENSION)):
    dim = _dimension(dimension)
    return {"removed": store.clear_logs(dim), "dimension": dim}


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 4) if values else 0.0


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = min(len(ordered) - 1, int(round((pct / 100) * (len(ordered) - 1))))
    return round(ordered[position], 1)


@app.get("/api/py/insights")
def insights(dimension: int = Query(config.DEFAULT_DIMENSION)):
    dim = _dimension(dimension)
    entries = store.read_logs(dim)

    if not entries:
        return {"dimension": dim, "queries": 0, "empty": True}

    totals = [e.get("timings", {}).get("total_ms", 0) for e in entries]
    grounding = [e.get("metrics", {}).get("grounding", 0) for e in entries]
    coverage = [e.get("metrics", {}).get("coverage", 0) for e in entries]
    top_scores = [
        e.get("metrics", {}).get("retrieval", {}).get("top_score", 0) for e in entries
    ]

    stage_totals = {"embed_ms": 0.0, "retrieve_ms": 0.0, "generate_ms": 0.0}
    for entry in entries:
        timings = entry.get("timings", {})
        for stage in stage_totals:
            stage_totals[stage] += timings.get(stage, 0) or 0

    # Which documents actually earn their place in the knowledge base.
    document_hits: dict[str, dict] = {}
    for entry in entries:
        for source in entry.get("sources", []):
            name = source.get("filename", "unknown")
            bucket = document_hits.setdefault(name, {"hits": 0, "score_total": 0.0})
            bucket["hits"] += 1
            bucket["score_total"] += source.get("score", 0)

    leaderboard = sorted(
        (
            {
                "filename": name,
                "hits": data["hits"],
                "mean_score": round(data["score_total"] / data["hits"], 4),
            }
            for name, data in document_hits.items()
        ),
        key=lambda row: row["hits"],
        reverse=True,
    )[:8]

    audited = [e for e in entries if e.get("judge")]

    return {
        "dimension": dim,
        "empty": False,
        "queries": len(entries),
        "latency": {
            "mean_ms": round(_mean(totals), 1),
            "p50_ms": _percentile(totals, 50),
            "p95_ms": _percentile(totals, 95),
            "fastest_ms": round(min(totals), 1) if totals else 0,
            "slowest_ms": round(max(totals), 1) if totals else 0,
        },
        "stage_share": {
            stage: round(value / len(entries), 1) for stage, value in stage_totals.items()
        },
        "quality": {
            "mean_grounding": _mean(grounding),
            "mean_coverage": _mean(coverage),
            "mean_top_score": _mean(top_scores),
            "weak_retrievals": sum(1 for s in top_scores if s < 0.35),
            "uncited_answers": sum(
                1
                for e in entries
                if not e.get("metrics", {}).get("citations", {}).get("count")
            ),
        },
        "audit": {
            "count": len(audited),
            "mean_groundedness": _mean(
                [e["judge"].get("groundedness", 0) for e in audited]
            ),
            "mean_relevance": _mean([e["judge"].get("relevance", 0) for e in audited]),
        },
        "documents": leaderboard,
        "recent": entries[:12],
    }


# ---------------------------------------------------------------------------
# Dimension lab
# ---------------------------------------------------------------------------

@app.post("/api/py/lab/compare")
def lab_compare(body: dict = Body(...)):
    """Run one query against every indexed dimension and compare retrieval.

    Generation is skipped on purpose — the variable under test is the embedding
    width, and an LLM call would swamp the timing differences with noise.
    """
    question = (body.get("query") or "").strip()
    if not question:
        raise HTTPException(400, "A query is required.")
    top_k = max(1, min(20, int(body.get("top_k") or 5)))

    requested = body.get("dimensions") or store.known_dimensions()
    dimensions = [d for d in requested if d in config.SUPPORTED_DIMENSIONS]
    if not dimensions:
        raise HTTPException(400, "No indexed dimensions to compare. Build one first.")

    runs = []
    for dim in sorted(dimensions):
        if not store.index_exists(dim):
            runs.append({"dimension": dim, "available": False})
            continue

        embed_started = time.perf_counter()
        vector = embeddings.embed_query(question, dim)
        embed_ms = (time.perf_counter() - embed_started) * 1000

        search_started = time.perf_counter()
        chunks = store.search(dim, vector, top_k)
        search_ms = (time.perf_counter() - search_started) * 1000

        runs.append(
            {
                "dimension": dim,
                "available": True,
                "chunks": store.count_chunks(dim),
                "embed_ms": round(embed_ms, 1),
                "search_ms": round(search_ms, 1),
                "total_ms": round(embed_ms + search_ms, 1),
                "metrics": evaluate.retrieval_metrics(chunks),
                "coverage": evaluate.context_coverage(question, chunks),
                "top_sources": [
                    {
                        "filename": c["filename"],
                        "score": round(c["score"], 4),
                        "excerpt": c["text"][:220],
                    }
                    for c in chunks[:3]
                ],
            }
        )

    return {"query": question, "top_k": top_k, "runs": runs}


@app.post("/api/py/lab/reindex", dependencies=[Depends(require_admin)])
def lab_reindex(body: dict = Body(...)):
    """Re-embed an existing knowledge base at a different dimension.

    Chunk text is already stored in vector metadata, so the source documents do
    not need re-uploading — the corpus is copied and re-embedded in place.
    """
    source = _dimension(int(body.get("source") or config.DEFAULT_DIMENSION))
    target = _dimension(int(body.get("target") or 0))
    if source == target:
        raise HTTPException(400, "Source and target dimensions must differ.")
    if not store.index_exists(source):
        raise HTTPException(400, f"No index exists at {source} dimensions.")

    documents = store.list_documents(source)
    if not documents:
        raise HTTPException(400, "The source knowledge base is empty.")

    started = time.perf_counter()
    store.ensure_index(target)

    copied = 0
    truncated = False
    budget_seconds = 45  # stay inside the serverless execution window

    for document in documents:
        if time.perf_counter() - started > budget_seconds:
            truncated = True
            break

        doc_id = document["id"]
        texts = store.document_chunk_texts(source, doc_id)
        if not texts:
            continue

        new_vectors = embeddings.embed_documents(texts, target)
        preview = document.get("preview", "")
        filename = document.get("filename", "document")
        summary_vector = embeddings.embed_documents(
            [f"{filename}\n\n{preview}"], target
        )[0]

        meta = {k: v for k, v in document.items() if k != "id"}
        meta["dimension"] = target
        meta["chunks"] = len(texts)

        store.store_document(
            dimension=target,
            doc_id=doc_id,
            filename=filename,
            chunks=texts,
            chunk_vectors=new_vectors,
            summary_vector=summary_vector,
            meta=meta,
        )
        copied += len(texts)

    return {
        "source": source,
        "target": target,
        "chunks_copied": copied,
        "truncated": truncated,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
    }
