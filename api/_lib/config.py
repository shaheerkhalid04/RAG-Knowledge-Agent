"""Central configuration, read once from the environment."""

import os

# Next.js reads .env.local on its own; uvicorn does not. Load it here so the
# documented local workflow works with one command. On Vercel this finds
# nothing and the platform's environment variables are used unchanged.
try:
    from dotenv import load_dotenv

    _ROOT = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    for _name in (".env.local", ".env"):
        load_dotenv(os.path.join(_ROOT, _name), override=False)
except ImportError:
    pass

# --- Credentials -----------------------------------------------------------
PINECONE_API_KEY = os.environ.get("PINECONE_API_KEY", "").strip()
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
# Required for every write (upload, delete, log wipe, reindex). Unset means writes are off.
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "").strip()

# --- Embeddings ------------------------------------------------------------
# Pinecone hosts the embedding model, so no third embedding provider/key is
# needed. llama-text-embed-v2 supports Matryoshka truncation, which is what
# makes the dimension comparison in the Lab meaningful.
EMBED_MODEL = os.environ.get("EMBED_MODEL", "llama-text-embed-v2")
SUPPORTED_DIMENSIONS = (384, 512, 768, 1024, 2048)
DEFAULT_DIMENSION = int(os.environ.get("EMBED_DIMENSION", "1024"))
EMBED_BATCH = 96  # Pinecone inference caps a single embed call at 96 inputs

# --- Vector store ----------------------------------------------------------
INDEX_PREFIX = os.environ.get("PINECONE_INDEX_PREFIX", "rag-kb")
PINECONE_CLOUD = os.environ.get("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.environ.get("PINECONE_REGION", "us-east-1")

NS_CHUNKS = "chunks"
NS_REGISTRY = "registry"
NS_LOGS = "logs"

# A collection is a pair of namespaces (chunks, registry) in the same index. "chunks" is the
# original corpus. "portfolio" holds the CV and project READMEs that the portfolio's Ask box
# queries; it is never written to the public query log.
COLLECTIONS = {
    "chunks": (NS_CHUNKS, NS_REGISTRY),
    "portfolio": ("portfolio", "portfolio-registry"),
}


def namespaces(collection: str) -> tuple[str, str]:
    if collection not in COLLECTIONS:
        raise ValueError(f"Unknown collection {collection!r}. Choose one of {list(COLLECTIONS)}.")
    return COLLECTIONS[collection]

# --- Generation ------------------------------------------------------------
CHAT_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")
# Deliberately not an 8B model. Smaller judges score faithful answers as
# ungrounded and quote the sources back as if they were claims, which makes the
# audit worse than useless; gpt-oss-20b is stable on both directions.
JUDGE_MODEL = os.environ.get("GROQ_JUDGE_MODEL", "openai/gpt-oss-20b")

# --- Ingestion limits ------------------------------------------------------
# Vercel serverless functions reject request bodies above ~4.5 MB.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "150"))

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md", ".markdown")


def index_name(dimension: int) -> str:
    """One index per embedding dimension; they cannot be mixed in Pinecone."""
    return f"{INDEX_PREFIX}-{dimension}"


def missing_credentials() -> list[str]:
    missing = []
    if not PINECONE_API_KEY:
        missing.append("PINECONE_API_KEY")
    if not GROQ_API_KEY:
        missing.append("GROQ_API_KEY")
    return missing
