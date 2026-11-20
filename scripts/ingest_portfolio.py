"""Fill the `portfolio` collection that the portfolio's "Ask my portfolio" box queries.

Uploads local files (the CV, write-ups) and every project README fetched from GitHub through
the deployed API, so they are chunked and embedded exactly like any other upload.

    ADMIN_TOKEN=... python scripts/ingest_portfolio.py --base https://rag-knowledge-agent-omega.vercel.app cv.pdf
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import urllib.request
import uuid

REPOS = [
    "shaheerkhalid04",
    "physiotherapist",
    "ai-automation-news-bot",
    "RAG-Knowledge-Agent",
    "realtime-rag-voice-ai-agent",
    "kanva-task-board",
    "Shaheer-Khalid-FlyRank-ML-Internship",
    "mcp-trello",
    "vaultline",
    "n8n-property-workflow",
    "Real-Time-Voice-AI-Agent",
    "ai-video-transcribing",
]


def upload(base: str, token: str, filename: str, data: bytes) -> dict:
    boundary = uuid.uuid4().hex
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    parts = []
    for name, value in (("dimension", "1024"), ("collection", "portfolio")):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode()
        + data
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        f"{base.rstrip('/')}/api/py/documents",
        data=b"".join(parts),
        method="POST",
        headers={"content-type": f"multipart/form-data; boundary={boundary}", "x-admin-token": token},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("files", nargs="*", help="local files, for example the CV")
    parser.add_argument("--skip-readmes", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("ADMIN_TOKEN", "")
    if not token:
        print("Set ADMIN_TOKEN in the environment.", file=sys.stderr)
        return 1

    for path in args.files:
        with open(path, "rb") as handle:
            result = upload(args.base, token, os.path.basename(path), handle.read())
        print(f"{path}: {result.get('chunks')} chunks")

    if not args.skip_readmes:
        for repo in REPOS:
            url = f"https://raw.githubusercontent.com/shaheerkhalid04/{repo}/main/README.md"
            with urllib.request.urlopen(url, timeout=30) as response:
                data = response.read()
            result = upload(args.base, token, f"{repo}-README.md", data)
            print(f"{repo}: {result.get('chunks')} chunks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
