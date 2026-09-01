"""Streamed export -- a generator over a cursor, never a fully-materialized
list, per the size-agnostic constraint."""
from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Query
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

_SEGMENT_COLUMNS = [
    "segment_id", "item_type", "item_id", "thread_id", "coder_id",
    "coder_name", "pass_no", "status", "start_offset", "end_offset",
    "selected_text", "context_text", "memo", "author", "source_created_utc",
    "permalink", "code_ids", "codes", "theme_ids", "themes", "created_at",
    "updated_at",
]

_SEGMENT_QUERY = """
SELECT s.id AS segment_id, s.item_type, s.item_id, s.thread_id, s.coder_id,
       co.name AS coder_name, s.pass_no, s.status, s.start_offset, s.end_offset,
       s.selected_text, s.context_text, COALESCE(s.memo, '') AS memo,
       CASE WHEN s.item_type='comment' THEN cm.author ELSE th.author END AS author,
       CASE WHEN s.item_type='comment' THEN cm.created_utc ELSE th.created_utc END
         AS source_created_utc,
       CASE WHEN s.item_type='comment' THEN cm.permalink ELSE th.permalink END
         AS permalink,
       COALESCE((SELECT group_concat(c.id, ' | ')
                 FROM segment_codes sc JOIN codes c ON c.id=sc.code_id
                 WHERE sc.segment_id=s.id AND c.codebook_id=?), '') AS code_ids,
       COALESCE((SELECT group_concat(c.name, ' | ')
                 FROM segment_codes sc JOIN codes c ON c.id=sc.code_id
                 WHERE sc.segment_id=s.id AND c.codebook_id=?), '') AS codes,
       COALESCE((SELECT group_concat(t.id, ' | ')
                 FROM segment_themes st JOIN themes t ON t.id=st.theme_id
                 WHERE st.segment_id=s.id AND t.codebook_id=?), '') AS theme_ids,
       COALESCE((SELECT group_concat(t.name, ' | ')
                 FROM segment_themes st JOIN themes t ON t.id=st.theme_id
                 WHERE st.segment_id=s.id AND t.codebook_id=?), '') AS themes,
       s.created_at, s.updated_at
FROM evidence_segments s
JOIN coders co ON co.id=s.coder_id
LEFT JOIN corpus.comments cm ON s.item_type='comment' AND cm.id=s.item_id
LEFT JOIN corpus.threads th ON s.item_type='thread' AND th.id=s.item_id
WHERE s.coder_id=? AND s.pass_no=?
ORDER BY s.thread_id, source_created_utc, s.start_offset, s.created_at
"""


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


def _segment_csv_stream(conn: sqlite3.Connection, codebook_id: str,
                        coder_id: str, pass_no: int) -> Iterator[str]:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_SEGMENT_COLUMNS)
    writer.writeheader()
    yield buf.getvalue()
    cur = conn.execute(_SEGMENT_QUERY,
                       (codebook_id, codebook_id, codebook_id, codebook_id,
                        coder_id, pass_no))
    for values in cur:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=_SEGMENT_COLUMNS)
        writer.writerow(dict(zip(_SEGMENT_COLUMNS, values)))
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


@router.get("/export/segments")
def export_segments(codebook_id: str, coder_id: str,
                    pass_no: int = Query(ge=1, le=2),
                    conn: sqlite3.Connection = Depends(get_conn)
                    ) -> StreamingResponse:
    """Export source-grounded analysis units, one complete segment per row."""
    safe_coder_id = re.sub(r"[^A-Za-z0-9._-]+", "-", coder_id).strip("-._")
    filename = f"thicket-segments-{safe_coder_id or 'coder'}-pass-{pass_no}.csv"
    return StreamingResponse(
        _segment_csv_stream(conn, codebook_id, coder_id, pass_no),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
