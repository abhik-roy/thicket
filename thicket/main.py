"""FastAPI app entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from thicket import corpus, db
from thicket.config import Settings
from thicket.routers import export, imports, items, labels, reliability, workspace
from thicket.seed_default import seed_default


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = Settings()
    corpus_conn = corpus.connect(settings.corpus_db)
    corpus_conn.close()
    conn = db.connect_labels(settings.labels_db)
    try:
        seed_default(conn, datetime.now(timezone.utc).isoformat())
    finally:
        conn.close()
    yield


app = FastAPI(title="Thicket", lifespan=lifespan)

# Permissive for local use: the React frontend commonly runs on a
# separate-origin development server (for example localhost:5173).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router)
app.include_router(labels.router)
app.include_router(reliability.router)
app.include_router(export.router)
app.include_router(imports.router)
app.include_router(workspace.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
