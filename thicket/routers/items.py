"""Thread/comment read endpoints. Cursor-paginated only -- no OFFSET,
per the size-agnostic design constraint."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from thicket.deps import get_conn

router = APIRouter()

_LIMIT_CLAMP_NOTE = (
    "Values outside [{lo}, {hi}] are silently clamped, not rejected -- a "
    "caller passing 0, a negative number, or a value above the ceiling "
    "still gets a valid, bounded page back rather than an error.")


def _row_to_dict(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {d[0]: v for d, v in zip(cursor.description, row)}


@router.get("/threads")
def list_threads(
        cursor: str | None = None,
        limit: int = Query(50, description=_LIMIT_CLAMP_NOTE.format(
            lo=1, hi=200)),
        subreddit: str | None = None,
        hydrated_only: bool = False,
        conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    limit = max(1, min(limit, 200))
    clauses = []
    params: list = []
    if cursor is not None:
        clauses.append("id > ?")
        params.append(cursor)
    if subreddit is not None:
        normalized_subreddit = subreddit.strip().removeprefix("r/").strip("/")
        if normalized_subreddit:
            clauses.append("subreddit = ? COLLATE NOCASE")
            params.append(normalized_subreddit)
    if hydrated_only:
        clauses.append("hydrated = 1 AND n_comments_fetched > 0")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = (f"SELECT * FROM corpus.threads {where} "
           f"ORDER BY id LIMIT ?")
    cur = conn.execute(sql, [*params, limit + 1])
    rows = cur.fetchall()
    items = [_row_to_dict(cur, r) for r in rows[:limit]]
    next_cursor = items[-1]["id"] if len(rows) > limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/communities")
def list_communities(
        conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    """Return the communities present in the active local corpus."""
    rows = conn.execute(
        "SELECT subreddit, COUNT(*) AS thread_count "
        "FROM corpus.threads GROUP BY subreddit "
        "ORDER BY subreddit COLLATE NOCASE"
    ).fetchall()
    return {
        "items": [
            {"name": row[0], "thread_count": row[1]} for row in rows
        ],
    }


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str,
              conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    cur = conn.execute("SELECT * FROM corpus.threads WHERE id = ?",
                       (thread_id,))
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="thread not found")
    return _row_to_dict(cur, row)


@router.get("/threads/{thread_id}/comments")
def list_comments(
        thread_id: str,
        cursor: str | None = None,
        limit: int = Query(100, description=_LIMIT_CLAMP_NOTE.format(
            lo=1, hi=500)),
        conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    thread = conn.execute(
        "SELECT hydrated FROM corpus.threads WHERE id = ?", (thread_id,)
    ).fetchone()
    if thread is None:
        raise HTTPException(status_code=404, detail="thread not found")
    if not thread[0]:
        raise HTTPException(
            status_code=409,
            detail="thread comments have not been hydrated",
        )
    limit = max(1, min(limit, 500))
    clauses = ["thread_id = ?"]
    params: list = [thread_id]
    if cursor is not None:
        clauses.append("id > ?")
        params.append(cursor)
    where = " AND ".join(clauses)
    sql = f"SELECT * FROM corpus.comments WHERE {where} ORDER BY id LIMIT ?"
    cur = conn.execute(sql, [*params, limit + 1])
    rows = cur.fetchall()
    items = [_row_to_dict(cur, r) for r in rows[:limit]]
    next_cursor = items[-1]["id"] if len(rows) > limit else None
    return {"items": items, "next_cursor": next_cursor}
