"""Cheap, deterministic quality signals computed on every query.

These run for free alongside retrieval. The optional LLM judge in `llm.py`
is more accurate but costs a second round trip, so it is opt-in per query.
"""

import re

STOPWORDS = frozenset(
    """a an and are as at be been but by for from had has have he her his if in into is it
    its of on or our she that the their them there these they this to was were what when
    where which who will with would you your we us not no can could should do does did""".split()
)

_WORD = re.compile(r"[a-z0-9][a-z0-9'\-]*")
_CITATION = re.compile(r"\[(\d{1,2})\]")


def _content_words(text: str) -> set[str]:
    return {
        word
        for word in _WORD.findall(text.lower())
        if word not in STOPWORDS and len(word) > 2
    }


def retrieval_metrics(chunks: list[dict], threshold: float = 0.35) -> dict:
    """Score distribution over the retrieved set.

    `spread` is the gap between the best and worst hit. A tight cluster of high
    scores means the query landed cleanly; a wide spread means top-k reached
    past the genuinely relevant material and is padding the context window.
    """
    if not chunks:
        return {
            "top_score": 0.0,
            "mean_score": 0.0,
            "spread": 0.0,
            "above_threshold": 0,
            "retrieved": 0,
            "documents": 0,
        }

    scores = [c["score"] for c in chunks]
    return {
        "top_score": round(max(scores), 4),
        "mean_score": round(sum(scores) / len(scores), 4),
        "spread": round(max(scores) - min(scores), 4),
        "above_threshold": sum(1 for s in scores if s >= threshold),
        "retrieved": len(chunks),
        "documents": len({c["doc_id"] for c in chunks}),
    }


def context_coverage(question: str, chunks: list[dict]) -> float:
    """Fraction of the question's content words that appear in retrieved text.

    A lexical proxy for recall: low coverage usually means the knowledge base
    has no material on part of what was asked.
    """
    asked = _content_words(question)
    if not asked:
        return 0.0
    context = _content_words(" ".join(c["text"] for c in chunks))
    return round(len(asked & context) / len(asked), 4)


def grounding_score(answer: str, chunks: list[dict]) -> float:
    """Fraction of the answer's content words traceable to the context.

    Not a substitute for the LLM judge - it cannot catch a fluent recombination
    of context words into a false claim - but it is instant and catches the
    common failure of the model answering from its own weights.
    """
    produced = _content_words(answer)
    if not produced:
        return 0.0
    context = _content_words(" ".join(c["text"] for c in chunks))
    return round(len(produced & context) / len(produced), 4)


def citations(answer: str, chunks: list[dict]) -> dict:
    """Which sources the answer actually cited, and whether they exist."""
    referenced = [int(n) for n in _CITATION.findall(answer)]
    valid = sorted({n for n in referenced if 1 <= n <= len(chunks)})
    dangling = sorted({n for n in referenced if n < 1 or n > len(chunks)})
    return {
        "cited": valid,
        "dangling": dangling,
        "count": len(valid),
        "unused": max(0, len(chunks) - len(valid)),
    }


def summarise(question: str, answer: str, chunks: list[dict]) -> dict:
    return {
        "retrieval": retrieval_metrics(chunks),
        "coverage": context_coverage(question, chunks),
        "grounding": grounding_score(answer, chunks),
        "citations": citations(answer, chunks),
    }
