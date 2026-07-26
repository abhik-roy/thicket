"""Streamed export -- a generator over a cursor, never a fully-materialized
list, per the size-agnostic constraint."""
from __future__ import annotations

import csv
import io
import json
import sqlite3
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from thicket.deps import get_conn

router = APIRouter()

_QUERY = """
SELECT l.item_type, l.item_id, l.pass_no, l.note, l.created_at,
       c.id AS code_id, c.name AS code_name,
       co.id AS coder_id, co.name AS coder_name
FROM labels l
JOIN codes c ON c.id = l.code_id
JOIN coders co ON co.id = l.coder_id
WHERE c.codebook_id = ?
ORDER BY l.item_id
"""

_COLUMNS = ["item_type", "item_id", "pass_no", "note", "created_at",
            "code_id", "code_name", "coder_id", "coder_name"]


def _rows(conn: sqlite3.Connection, codebook_id: str) -> Iterator[dict]:
    cur = conn.execute(_QUERY, (codebook_id,))
    for row in cur:
        yield dict(zip(_COLUMNS, row))


def _jsonl_stream(conn: sqlite3.Connection, codebook_id: str
                  ) -> Iterator[str]:
    for row in _rows(conn, codebook_id):
        yield json.dumps(row) + "\n"


def _csv_stream(conn: sqlite3.Connection, codebook_id: str) -> Iterator[str]:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_COLUMNS)
    writer.writeheader()
    yield buf.getvalue()
    for row in _rows(conn, codebook_id):
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=_COLUMNS)
        writer.writerow(row)
        yield buf.getvalue()


@router.get("/export")
def export(codebook_id: str, format: str = "jsonl",
          conn: sqlite3.Connection = Depends(get_conn)
          ) -> StreamingResponse:
    if format == "jsonl":
        return StreamingResponse(_jsonl_stream(conn, codebook_id),
                                 media_type="application/x-ndjson")
    if format == "csv":
        return StreamingResponse(_csv_stream(conn, codebook_id),
                                 media_type="text/csv")
    raise HTTPException(status_code=400,
                        detail=f"unknown format: {format!r}")
