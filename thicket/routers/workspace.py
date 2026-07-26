"""GUI-managed local corpus and labels database selection."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from thicket import corpus, db
from thicket.config import Settings, save_settings, settings_file
from thicket.seed_default import seed_default

router = APIRouter(prefix="/workspace", tags=["workspace"])
DATABASE_SUFFIXES = {".db", ".sqlite", ".sqlite3"}


class WorkspaceIn(BaseModel):
    corpus_db: str = Field(min_length=1, max_length=4096)
    labels_db: str = Field(min_length=1, max_length=4096)
    create_missing: bool = False


def _tables(path: Path) -> set[str]:
    uri = f"file:{path}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        return {
            row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")
        }
    finally:
        conn.close()


def _validated_path(raw: str) -> Path:
    path = Path(raw).expanduser().resolve()
    if path.suffix.lower() not in DATABASE_SUFFIXES:
        raise HTTPException(
            400, "database paths must end in .db, .sqlite, or .sqlite3")
    return path


def _prepare_corpus(path: Path, create_missing: bool) -> None:
    if not path.exists():
        if not create_missing:
            raise HTTPException(404, f"corpus database not found: {path}")
        corpus.connect(str(path)).close()
        return
    if not path.is_file():
        raise HTTPException(400, f"corpus path is not a file: {path}")
    try:
        tables = _tables(path)
    except sqlite3.Error as exc:
        raise HTTPException(400, f"cannot open corpus database: {exc}") from None
    if not {"threads", "comments"} <= tables:
        raise HTTPException(400, "selected corpus is not a Thicket corpus")


def _prepare_labels(path: Path, create_missing: bool) -> None:
    if not path.exists():
        if not create_missing:
            raise HTTPException(404, f"labels database not found: {path}")
        conn = db.connect_labels(str(path))
        try:
            seed_default(conn, datetime.now(timezone.utc).isoformat())
        finally:
            conn.close()
        return
    if not path.is_file():
        raise HTTPException(400, f"labels path is not a file: {path}")
    try:
        tables = _tables(path)
    except sqlite3.Error as exc:
        raise HTTPException(400, f"cannot open labels database: {exc}") from None
    if not {"coders", "codebooks", "codes", "labels", "assignments"} <= tables:
        raise HTTPException(400, "selected labels file is not a Thicket labels database")


def _counts(corpus_path: Path, labels_path: Path) -> dict:
    corpus_conn = sqlite3.connect(
        f"file:{corpus_path}?mode=ro", uri=True)
    labels_conn = sqlite3.connect(
        f"file:{labels_path}?mode=ro", uri=True)
    try:
        return {
            "threads": corpus_conn.execute(
                "SELECT COUNT(*) FROM threads").fetchone()[0],
            "comments": corpus_conn.execute(
                "SELECT COUNT(*) FROM comments").fetchone()[0],
            "coders": labels_conn.execute(
                "SELECT COUNT(*) FROM coders").fetchone()[0],
            "codebooks": labels_conn.execute(
                "SELECT COUNT(*) FROM codebooks").fetchone()[0],
            "labels": labels_conn.execute(
                "SELECT COUNT(*) FROM labels").fetchone()[0],
        }
    finally:
        corpus_conn.close()
        labels_conn.close()


def _workspace_body() -> dict:
    settings = Settings()
    corpus_path = Path(settings.corpus_db)
    labels_path = Path(settings.labels_db)
    return {
        "corpus_db": str(corpus_path),
        "labels_db": str(labels_path),
        "settings_file": str(settings_file()),
        "counts": _counts(corpus_path, labels_path),
    }


@router.get("")
def get_workspace() -> dict:
    return _workspace_body()


@router.get("/databases")
def discover_databases() -> dict:
    settings = Settings()
    directories = {
        Path.cwd().resolve(),
        (Path.cwd() / "data").resolve(),
        Path(settings.corpus_db).parent,
        Path(settings.labels_db).parent,
    }
    found: set[str] = {settings.corpus_db, settings.labels_db}
    for directory in directories:
        if not directory.is_dir():
            continue
        for pattern in ("*.db", "*.sqlite", "*.sqlite3"):
            found.update(str(path.resolve()) for path in directory.glob(pattern))
    return {"paths": sorted(found)}


@router.get("/browse")
def browse_files(path: str | None = None) -> dict:
    """List folders and SQLite files for the local GUI file picker."""
    requested = Path(path).expanduser() if path else Path.home()
    directory = requested.resolve()
    if not directory.exists():
        raise HTTPException(404, f"folder not found: {directory}")
    if not directory.is_dir():
        raise HTTPException(400, f"path is not a folder: {directory}")
    try:
        children = sorted(
            directory.iterdir(),
            key=lambda item: (not item.is_dir(), item.name.casefold()),
        )
    except PermissionError:
        raise HTTPException(403, f"cannot open folder: {directory}") from None

    entries = []
    for child in children:
        try:
            is_directory = child.is_dir()
            if not is_directory and (
                    not child.is_file()
                    or child.suffix.lower() not in DATABASE_SUFFIXES):
                continue
        except OSError:
            continue
        entries.append({
            "name": child.name,
            "path": str(child.resolve()),
            "kind": "directory" if is_directory else "database",
        })
    parent = directory.parent
    return {
        "directory": str(directory),
        "parent": None if parent == directory else str(parent),
        "entries": entries,
    }


@router.put("")
def switch_workspace(body: WorkspaceIn) -> dict:
    corpus_path = _validated_path(body.corpus_db)
    labels_path = _validated_path(body.labels_db)
    if corpus_path == labels_path:
        raise HTTPException(400, "corpus and labels must be different files")
    _prepare_corpus(corpus_path, body.create_missing)
    _prepare_labels(labels_path, body.create_missing)
    save_settings(str(corpus_path), str(labels_path))
    return _workspace_body()
