"""Answer generation and LLM-as-judge scoring, both on Groq."""

import json
import re

from . import config

_client = None


class MissingCredentials(Exception):
    pass


def client():
    global _client
    if _client is None:
        if not config.GROQ_API_KEY:
            raise MissingCredentials(
                "GROQ_API_KEY is not set. Add it to .env.local or your Vercel project."
            )
        from groq import Groq

        _client = Groq(api_key=config.GROQ_API_KEY)
    return _client


SYSTEM_PROMPT = """You are a retrieval-grounded research assistant.

Rules:
- Answer using ONLY the numbered sources provided. They are the entire world.
- Cite every factual claim inline with bracketed source numbers, like [1] or [2][4].
- If the sources do not contain the answer, say so plainly and name what is missing. Never fill the gap from your own knowledge.
- Quote exact figures, names and dates rather than paraphrasing them.
- Be direct and concise. No preamble, no restating the question, no "based on the provided sources".
- Prefer short paragraphs. Use a list only when the content is genuinely a list."""


def build_context(chunks: list[dict]) -> str:
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        blocks.append(f"[{i}] ({chunk['filename']})\n{chunk['text']}")
    return "\n\n---\n\n".join(blocks)


def generate_answer(question: str, chunks: list[dict], model: str | None = None) -> str:
    if not chunks:
        return (
            "There is nothing in the knowledge base to answer from yet. "
            "Add a document in Sources and ask again."
        )

    response = client().chat.completions.create(
        model=model or config.CHAT_MODEL,
        temperature=0.2,
        max_tokens=1200,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Sources:\n\n{build_context(chunks)}\n\nQuestion: {question}",
            },
        ],
    )
    return (response.choices[0].message.content or "").strip()


JUDGE_PROMPT = """You audit an ANSWER against the SOURCES it was supposed to be built from.

Return ONLY minified JSON, no prose, no code fence, matching exactly:
{"groundedness": <0-100>, "relevance": <0-100>, "unsupported_claims": ["..."]}

groundedness: what percentage of the ANSWER is directly supported by the SOURCES.
relevance: how well the ANSWER addresses the QUESTION.
unsupported_claims: up to three fragments copied VERBATIM FROM THE ANSWER that the SOURCES do not support.

Rules for unsupported_claims:
- Every string must appear word-for-word inside the ANSWER.
- Never quote the SOURCES. Material that appears in the SOURCES but not in the ANSWER is not a claim and must be ignored.
- Return [] if the ANSWER is fully supported."""


def _verbatim_claims(claims: list, answer: str) -> list[str]:
    """Keep only claims actually present in the answer.

    Small judge models reliably invert this task and quote the sources back
    instead, which would surface alarming and completely false warnings. A
    substring check is a cheap, deterministic guard against that.
    """
    normalise = lambda text: " ".join(str(text).split()).lower()  # noqa: E731
    haystack = normalise(answer)
    return [
        str(claim)
        for claim in claims
        if len(normalise(claim)) > 8 and normalise(claim) in haystack
    ][:3]


def judge_answer(question: str, answer: str, chunks: list[dict]) -> dict | None:
    """Second-pass audit with a small fast model. Returns None if it fails -
    an unavailable judge should never take down the main answer."""
    try:
        response = client().chat.completions.create(
            model=config.JUDGE_MODEL,
            temperature=0,
            max_tokens=400,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": JUDGE_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Sources:\n\n{build_context(chunks)}\n\n"
                        f"Question: {question}\n\nAnswer: {answer}"
                    ),
                },
            ],
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```(?:json)?|```$", "", raw).strip()
        parsed = json.loads(raw)
        return {
            "groundedness": max(0, min(100, int(parsed.get("groundedness", 0)))),
            "relevance": max(0, min(100, int(parsed.get("relevance", 0)))),
            "unsupported_claims": _verbatim_claims(
                parsed.get("unsupported_claims") or [], answer
            ),
        }
    except Exception:
        return None
