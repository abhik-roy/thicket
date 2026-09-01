"""FastAPI app entrypoint."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import FileResponse

from thicket import corpus, db
from thicket.config import Settings
from thicket.routers import (
    export, imports, items, labels, open_coding, reliability, workspace,
)
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
app.include_router(open_coding.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


class _SinglePageFiles(StaticFiles):
    """Static files with a single-page-app fallback.

    The frontend uses BrowserRouter, so a deep link such as /thread/abc123 is
    a real request to the server on refresh or share. Anything that is not an
    actual file on disk is answered with index.html and routed client-side.
    """

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404:
                raise
            return FileResponse(Path(self.directory) / "index.html")


# Optional single-origin deployment: when THICKET_STATIC_DIR points at a built
# frontend, the API process also serves it, so the browser never issues a
# cross-origin request and the CORS rules above stop mattering. Unset during
# local development, where Vite serves the frontend on its own port.
_static_dir = os.environ.get("THICKET_STATIC_DIR")
if _static_dir:
    # Mounted last so every route registered above keeps precedence over the
    # catch-all.
    app.mount(
        "/", _SinglePageFiles(directory=_static_dir, html=True), name="static")
