# Archivist — Adaptive RAG Knowledge Agent

A retrieval-augmented knowledge assistant with a live, user-controlled corpus.
Upload documents and they are chunked, embedded and indexed on the spot. Delete
one and its vectors leave the index with it. Every answer is cited back to the
exact chunk it came from and scored for how well it stayed grounded, and the
whole thing runs as a single deployment on Vercel.

---

## What it does

**Ask** — Questions are answered only from retrieved context, with inline
citations that expand into the source chunk and its similarity score. Each
answer carries a live readout of top match, grounding, query coverage and a
stage-by-stage latency breakdown.

**Sources** — Drag-and-drop ingestion of PDF, DOCX, TXT and Markdown. The
document list is the index: deleting a document removes every vector it
produced, so retrieval can never surface stale content.

**Insights** — Every query is logged with its timings and quality scores. The
dashboard shows p50/p95 latency, where time is spent across embed/retrieve/
generate, mean grounding, how many retrievals came back weak, and which
documents actually earn their place in the corpus.

**Lab** — The same corpus embedded at 384, 512, 768, 1024 and 2048 dimensions,
queried side by side. Since chunk text is stored alongside every vector, the
corpus can be mirrored to another dimension without re-uploading anything.

---

## Architecture

```
Browser ──► Next.js (App Router, React 19)
                │
                │  /api/py/*
                ▼
         FastAPI (Python serverless function on Vercel)
                │
        ┌───────┴────────┐
        ▼                ▼
   Pinecone          Groq
   ├ embeddings      └ llama-3.3-70b  (generation)
   ├ vector search      llama-3.1-8b  (audit / LLM-as-judge)
   └ query log
```

Two API keys, one deployment. Embeddings come from Pinecone's hosted inference
rather than a third provider, which keeps the function well under Vercel's
250 MB bundle ceiling — a local sentence-transformers model would never fit.

### Notable design decisions

**No LangChain.** The pipeline is ~600 lines of explicit Python. The chunker is
a small recursive character splitter; skipping the framework keeps the
serverless bundle small and makes every step of the pipeline legible.

**Chunk IDs encode their document.** Pinecone *serverless* indexes cannot delete
by metadata filter — only by ID. Chunks are keyed `{doc_id}#{n}`, so a document's
vectors can be listed by prefix and deleted exactly, with no orphans.

**One index per dimension.** A Pinecone index has a single fixed dimension, so
the Lab creates `rag-kb-384`, `rag-kb-1024` and so on as needed.

**The query log is itself a vector namespace.** Each log entry is stored under
the query embedding that was already computed for retrieval — free to store, and
it makes past queries semantically searchable.

**Evaluation runs on every query, for free.** Grounding and coverage are lexical
overlap measures computed locally in microseconds. The heavier LLM-as-judge pass
is opt-in per query via the Audit toggle, because it costs a second round trip.

---

## Running locally

Requires Node 20+ and Python 3.12+.

```bash
npm install
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt uvicorn
```

Copy `.env.example` to `.env.local` and fill in both keys:

```bash
PINECONE_API_KEY=...   # https://app.pinecone.io
GROQ_API_KEY=...       # https://console.groq.com/keys
```

Then start both processes together:

```bash
npm run dev
```

Next.js serves on `:3000` and proxies `/api/py/*` to uvicorn on `:8000`. In
production Vercel routes the same prefix to the serverless function instead, so
the client code is identical in both environments.

---

## Deploying

Push to GitHub and import the repository on Vercel. Add `PINECONE_API_KEY` and
`GROQ_API_KEY` as environment variables. The Python function is detected from
`requirements.txt` and `api/index.py`; `vercel.json` grants it a 60-second
ceiling for the embedding-heavy ingestion path.

Note that Vercel caps serverless request bodies at ~4.5 MB, so uploads are
limited to 4 MB per file. The UI enforces this before sending.

---

## Configuration

Every value below has a working default; override in `.env.local` or in Vercel.

| Variable | Default | Notes |
| --- | --- | --- |
| `EMBED_MODEL` | `llama-text-embed-v2` | Must support Matryoshka truncation for the Lab |
| `EMBED_DIMENSION` | `1024` | Default index width |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Answer generation |
| `GROQ_JUDGE_MODEL` | `llama-3.1-8b-instant` | Audit pass |
| `CHUNK_SIZE` | `900` | Characters per chunk |
| `CHUNK_OVERLAP` | `150` | Characters shared between neighbours |
| `PINECONE_INDEX_PREFIX` | `rag-kb` | Indexes are `{prefix}-{dimension}` |
| `PINECONE_CLOUD` / `PINECONE_REGION` | `aws` / `us-east-1` | Serverless spec |

---

## Project structure

```
api/
  index.py           FastAPI routes
  _lib/
    config.py        Environment and constants
    extract.py       PDF / DOCX / text extraction
    chunking.py      Recursive character splitter
    embeddings.py    Pinecone hosted inference
    store.py         Index lifecycle, upsert, search, deletion, query log
    llm.py           Groq generation and LLM-as-judge
    evaluate.py      Grounding, coverage, citation and retrieval metrics
app/                 Ask, Sources, Insights, Lab
components/          Design system, answer renderer, workspace state
lib/                 Typed API client
```
