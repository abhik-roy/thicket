"""Streamed export -- a generator over a cursor, never a fully-materialized
list, per the size-agnostic constraint."""
from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from collections.abc import Iterator
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable, HRFlowable, Paragraph, SimpleDocTemplate, Spacer,
)
from xml.sax.saxutils import escape, quoteattr

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
    "permalink", "code_ids", "codes", "code_colors", "theme_ids", "themes",
    "theme_colors", "created_at", "updated_at",
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
       COALESCE((SELECT group_concat(c.color, ' | ')
                 FROM segment_codes sc JOIN codes c ON c.id=sc.code_id
                 WHERE sc.segment_id=s.id AND c.codebook_id=?), '') AS code_colors,
       COALESCE((SELECT group_concat(t.id, ' | ')
                 FROM segment_themes st JOIN themes t ON t.id=st.theme_id
                 WHERE st.segment_id=s.id AND t.codebook_id=?), '') AS theme_ids,
       COALESCE((SELECT group_concat(t.name, ' | ')
                 FROM segment_themes st JOIN themes t ON t.id=st.theme_id
                 WHERE st.segment_id=s.id AND t.codebook_id=?), '') AS themes,
       COALESCE((SELECT group_concat(t.color, ' | ')
                 FROM segment_themes st JOIN themes t ON t.id=st.theme_id
                 WHERE st.segment_id=s.id AND t.codebook_id=?), '') AS theme_colors,
       s.created_at, s.updated_at
FROM evidence_segments s
JOIN coders co ON co.id=s.coder_id
LEFT JOIN corpus.comments cm ON s.item_type='comment' AND cm.id=s.item_id
LEFT JOIN corpus.threads th ON s.item_type='thread' AND th.id=s.item_id
WHERE s.coder_id=? AND s.pass_no=?
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


def _segment_rows(conn: sqlite3.Connection, codebook_id: str,
                  coder_id: str, pass_no: int, thread_id: str | None = None,
                  code_ids: list[str] | None = None,
                  view: Literal["all", "uncoded", "uncertain"] = "all",
                  theme_id: str | None = None,
                  search: str | None = None) -> Iterator[dict]:
    sql = _SEGMENT_QUERY
    args: list = [codebook_id] * 6 + [coder_id, pass_no]
    if thread_id:
        sql += " AND s.thread_id=?"
        args.append(thread_id)
    if code_ids:
        placeholders = ",".join("?" * len(code_ids))
        sql += (" AND EXISTS (SELECT 1 FROM segment_codes f "
                f"WHERE f.segment_id=s.id AND f.code_id IN ({placeholders}))")
        args.extend(code_ids)
    if view == "uncoded":
        sql += (" AND NOT EXISTS (SELECT 1 FROM segment_codes f "
                "JOIN codes fc ON fc.id=f.code_id WHERE f.segment_id=s.id "
                "AND fc.codebook_id=?)")
        args.append(codebook_id)
    elif view == "uncertain":
        sql += " AND s.status='uncertain'"
    if theme_id:
        sql += (" AND EXISTS (SELECT 1 FROM segment_themes ft "
                "WHERE ft.segment_id=s.id AND ft.theme_id=?)")
        args.append(theme_id)
    if search and search.strip():
        needle = f"%{search.strip().lower()}%"
        sql += (" AND (lower(s.selected_text) LIKE ? OR lower(s.context_text) LIKE ? "
                "OR lower(COALESCE(s.memo,'')) LIKE ? "
                "OR lower(COALESCE(cm.author,th.author,'')) LIKE ? "
                "OR EXISTS (SELECT 1 FROM segment_codes fs JOIN codes fc "
                "ON fc.id=fs.code_id WHERE fs.segment_id=s.id "
                "AND lower(fc.name) LIKE ?) "
                "OR EXISTS (SELECT 1 FROM segment_themes fts JOIN themes ft "
                "ON ft.id=fts.theme_id WHERE fts.segment_id=s.id "
                "AND lower(ft.name) LIKE ?))")
        args.extend([needle] * 6)
    sql += " ORDER BY s.thread_id, source_created_utc, s.start_offset, s.created_at"
    cur = conn.execute(sql, args)
    for values in cur:
        yield dict(zip(_SEGMENT_COLUMNS, values))


def _segment_csv_stream(conn: sqlite3.Connection, codebook_id: str,
                        coder_id: str, pass_no: int, **filters) -> Iterator[str]:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_SEGMENT_COLUMNS)
    writer.writeheader()
    yield buf.getvalue()
    for row in _segment_rows(
            conn, codebook_id, coder_id, pass_no, **filters):
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=_SEGMENT_COLUMNS)
        writer.writerow(row)
        yield buf.getvalue()


class _Pills(Flowable):
    def __init__(self, values: list[tuple[str, str]], fallback: str = "Uncoded"):
        super().__init__()
        self.values = values or [(fallback, "#7c8983")]
        self.height = 18

    def wrap(self, available_width, _available_height):
        x = 0
        lines = 1
        for label, _ in self.values:
            width = stringWidth(label, "Helvetica-Bold", 8) + 14
            if x and x + width > available_width:
                lines += 1
                x = 0
            x += width + 5
        self.width = available_width
        self.height = lines * 18
        return available_width, self.height

    def draw(self):
        x, y = 0, self.height - 13
        for label, color in self.values:
            width = stringWidth(label, "Helvetica-Bold", 8) + 14
            if x and x + width > self.width:
                x, y = 0, y - 18
            self.canv.setFillColor(colors.HexColor(color))
            self.canv.roundRect(x, y, width, 14, 7, fill=1, stroke=0)
            self.canv.setFillColor(colors.white)
            self.canv.setFont("Helvetica-Bold", 8)
            self.canv.drawString(x + 7, y + 4, label)
            x += width + 5


def _pdf_bytes(rows: list[dict], coder_id: str, pass_no: int) -> bytes:
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, rightMargin=16 * mm,
                            leftMargin=16 * mm, topMargin=15 * mm,
                            bottomMargin=15 * mm,
                            title="Qualitative Coding Export")
    styles = getSampleStyleSheet()
    title = ParagraphStyle("Title", parent=styles["Title"], fontSize=19,
                           leading=23, textColor=colors.HexColor("#174f3c"),
                           alignment=TA_LEFT, spaceAfter=4)
    meta = ParagraphStyle("Meta", parent=styles["Normal"], fontSize=8,
                          leading=11, textColor=colors.HexColor("#68736e"))
    quote = ParagraphStyle("Quote", parent=styles["BodyText"], fontSize=10,
                           leading=15, textColor=colors.HexColor("#17201d"),
                           spaceBefore=6, spaceAfter=8,
                           backColor=colors.HexColor("#f7f9f6"),
                           borderColor=colors.HexColor("#dce2dd"),
                           borderWidth=.7, borderPadding=10, borderRadius=8)
    memo = ParagraphStyle("Memo", parent=styles["BodyText"], fontSize=9,
                          leading=13, textColor=colors.HexColor("#47554f"),
                          spaceAfter=7)
    story: list = [Paragraph("Qualitative Coding Export", title),
                   Paragraph(f"Coder: {escape(coder_id)} &nbsp;·&nbsp; Pass {pass_no} &nbsp;·&nbsp; {len(rows)} data units", meta),
                   Spacer(1, 6 * mm)]
    for row in rows:
        code_names = row["codes"].split(" | ") if row["codes"] else []
        code_colors = row["code_colors"].split(" | ") if row["code_colors"] else []
        theme_names = row["themes"].split(" | ") if row["themes"] else []
        theme_colors = row["theme_colors"].split(" | ") if row["theme_colors"] else []
        source_link = (f" &nbsp;·&nbsp; <link href={quoteattr(row['permalink'])} "
                       f"color=\"#174f3c\"><u>Original post</u></link>"
                       if row["permalink"] else "")
        contents: list = [Paragraph(
            f"<b>{escape(row['thread_id'])}</b> &nbsp;·&nbsp; "
            f"{escape(row['item_id'])} &nbsp;·&nbsp; "
            f"{escape(row['author'] or 'Unknown author')} &nbsp;·&nbsp; "
            f"{escape(row['status'])}{source_link}", meta),
            Spacer(1, 3 * mm),
            Paragraph(f"“{escape(row['selected_text'])}”", quote)]
        if row["memo"]:
            contents.append(Paragraph(f"<b>Memo:</b> {escape(row['memo'])}", memo))
        contents.append(_Pills(list(zip(code_names, code_colors))))
        if theme_names:
            contents.extend([Spacer(1, 4), _Pills(
                list(zip(theme_names, theme_colors)), "No themes")])
        story.extend(contents)
        story.extend([Spacer(1, 3 * mm), HRFlowable(
            width="100%", thickness=.6, color=colors.HexColor("#dce2dd")),
            Spacer(1, 4 * mm)])
    doc.build(story)
    return output.getvalue()


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
def export_segments(codebook_id: str, coder_id: str, format: str = "csv",
                    pass_no: int = Query(ge=1, le=2),
                    thread_id: str | None = None,
                    code_ids: str | None = None,
                    view: Literal["all", "uncoded", "uncertain"] = "all",
                    theme_id: str | None = None,
                    search: str | None = None,
                    conn: sqlite3.Connection = Depends(get_conn)
                    ) -> StreamingResponse:
    """Export source-grounded analysis units, one complete segment per row."""
    safe_coder_id = re.sub(r"[^A-Za-z0-9._-]+", "-", coder_id).strip("-._")
    stem = f"thicket-segments-{safe_coder_id or 'coder'}-pass-{pass_no}"
    filters = {
        "thread_id": thread_id,
        "code_ids": [value for value in (code_ids or "").split(",") if value],
        "view": view, "theme_id": theme_id, "search": search,
    }
    if format == "pdf":
        body = _pdf_bytes(list(_segment_rows(
            conn, codebook_id, coder_id, pass_no, **filters)), coder_id, pass_no)
        return StreamingResponse(
            iter([body]), media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{stem}.pdf"'},
        )
    if format != "csv":
        raise HTTPException(400, f"unknown format: {format!r}")
    return StreamingResponse(
        _segment_csv_stream(
            conn, codebook_id, coder_id, pass_no, **filters),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{stem}.csv"'},
    )
