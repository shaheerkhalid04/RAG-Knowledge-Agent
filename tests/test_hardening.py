"""Write lockdown, model pinning, collections and the verified health check.

Pinecone and Groq are replaced with fakes, so this runs without any credentials:
    pip install -r requirements.txt pytest httpx && python -m pytest tests
"""

import importlib
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))


def load(monkeypatch, admin_token=""):
    monkeypatch.setenv("ADMIN_TOKEN", admin_token)
    monkeypatch.setenv("GROQ_API_KEY", "test")
    monkeypatch.setenv("PINECONE_API_KEY", "test")
    for name in [m for m in sys.modules if m == "index" or m.startswith("_lib")]:
        del sys.modules[name]
    index = importlib.import_module("index")
    return index, TestClient(index.app)


def test_writes_are_off_without_an_admin_token(monkeypatch):
    _, client = load(monkeypatch, admin_token="")
    assert client.post("/api/py/documents", files={"file": ("a.txt", b"hello")}).status_code == 503
    assert client.delete("/api/py/documents/abc").status_code == 503
    assert client.delete("/api/py/logs").status_code == 503
    assert client.post("/api/py/lab/reindex", json={"source": 1024, "target": 384}).status_code == 503


def test_writes_need_the_right_token(monkeypatch):
    _, client = load(monkeypatch, admin_token="s3cret")
    assert client.delete("/api/py/logs").status_code == 401
    assert client.delete("/api/py/logs", headers={"x-admin-token": "wrong"}).status_code == 401


def test_query_ignores_the_requested_model_and_keeps_portfolio_out_of_the_log(monkeypatch):
    index, client = load(monkeypatch)
    seen = {}
    monkeypatch.setattr(index.embeddings, "embed_query", lambda q, d: [0.0] * d)
    monkeypatch.setattr(
        index.store,
        "search",
        lambda dim, vec, k, collection="chunks": seen.setdefault("collection", collection) and [
            {"id": "a#0", "score": 0.9, "text": "NESPAK school system", "filename": "cv.md", "doc_id": "a", "chunk_index": 0}
        ],
    )
    monkeypatch.setattr(index.llm, "generate_answer", lambda q, c, m: seen.setdefault("model", m) and "An answer [1].")
    monkeypatch.setattr(index.store, "log_query", lambda *a: seen.setdefault("logged", True) and "id")

    body = {"query": "What did he build at NESPAK?", "namespace": "portfolio", "model": "some-other-model"}
    response = client.post("/api/py/query", json=body)
    assert response.status_code == 200
    assert seen["model"] == index.config.CHAT_MODEL
    assert seen["collection"] == "portfolio"
    assert "logged" not in seen
    assert response.json()["log_id"] is None


def test_unknown_collection_is_refused(monkeypatch):
    _, client = load(monkeypatch)
    assert client.post("/api/py/query", json={"query": "hi", "namespace": "secret"}).status_code == 400


def test_verify_reports_a_failed_model_call(monkeypatch):
    index, client = load(monkeypatch)
    monkeypatch.setattr(index.store, "known_dimensions", lambda: [1024])

    def boom():
        raise RuntimeError("Error code: 404 - model_not_found")

    monkeypatch.setattr(index.llm, "verify", boom)
    payload = client.get("/api/py/health?verify=1").json()
    assert payload["ok"] is False and "latency_ms" not in payload

    monkeypatch.setattr(index.llm, "verify", lambda: {"ok": True, "model": "m", "latency_ms": 12.5})
    payload = client.get("/api/py/health?verify=1").json()
    assert payload["ok"] is True and payload["latency_ms"] == 12.5 and payload["model"] == index.config.CHAT_MODEL


def test_default_model_is_not_retired(monkeypatch):
    index, _ = load(monkeypatch)
    if not os.environ.get("GROQ_MODEL"):
        assert index.config.CHAT_MODEL == "openai/gpt-oss-120b"
