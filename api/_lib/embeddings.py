"""Embeddings via Pinecone's hosted inference API.

Using Pinecone for embeddings as well as storage keeps the whole pipeline down
to two API keys and avoids shipping a local sentence-transformers model, which
would never fit inside a Vercel serverless function.
"""

import time

from . import config
from .pine import client

# Only llama-text-embed-v2 exposes Matryoshka truncation; other hosted models
# have a fixed output width.
_TRUNCATABLE = {"llama-text-embed-v2"}


def native_dimension(model: str) -> int | None:
    return {
        "multilingual-e5-large": 1024,
        "pinecone-sparse-english-v0": None,
    }.get(model)


def _values(item) -> list[float]:
    if isinstance(item, dict):
        return list(item["values"])
    return list(getattr(item, "values"))


def _embed_batch(texts: list[str], input_type: str, dimension: int) -> list[list[float]]:
    parameters = {"input_type": input_type, "truncate": "END"}
    if config.EMBED_MODEL in _TRUNCATABLE:
        parameters["dimension"] = dimension

    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = client().inference.embed(
                model=config.EMBED_MODEL,
                inputs=texts,
                parameters=parameters,
            )
            data = getattr(response, "data", response)
            return [_values(item) for item in data]
        except Exception as exc:  # noqa: BLE001 - retried below, re-raised at the end
            last_error = exc
            message = str(exc).lower()
            retryable = "rate" in message or "429" in message or "timeout" in message
            if not retryable or attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))

    raise last_error  # unreachable, keeps type checkers happy


def embed_documents(texts: list[str], dimension: int) -> list[list[float]]:
    """Embed passages for storage, batching to respect the inference API cap."""
    vectors: list[list[float]] = []
    for start in range(0, len(texts), config.EMBED_BATCH):
        batch = texts[start : start + config.EMBED_BATCH]
        vectors.extend(_embed_batch(batch, "passage", dimension))
    return vectors


def embed_query(text: str, dimension: int) -> list[float]:
    """Embed a search query. `input_type` genuinely matters here - asymmetric
    models encode questions and passages differently."""
    return _embed_batch([text], "query", dimension)[0]
