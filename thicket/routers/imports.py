"""On-demand collection endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from thicket.config import Settings
from thicket.importer import import_threads

router = APIRouter(prefix="/imports", tags=["imports"])


class ArcticImportIn(BaseModel):
    subreddit: str = Field(min_length=1, max_length=100)
    query: str = Field(min_length=1, max_length=300)
    limit: int = Field(default=25, ge=1, le=100)
    hydrate: bool = True


@router.post("/arctic-shift")
def import_from_arctic_shift(body: ArcticImportIn) -> dict:
    try:
        return import_threads(
            corpus_path=Settings().corpus_db,
            subreddit=body.subreddit,
            query=body.query,
            limit=body.limit,
            hydrate=body.hydrate,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
