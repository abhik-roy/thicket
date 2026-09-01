"""Inductive coding: source-grounded segments, open codes, and themes."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from thicket.deps import get_conn

router = APIRouter(prefix="/open-coding", tags=["open-coding"])


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_dict(cur: sqlite3.Cursor, row: tuple) -> dict:
    return {d[0]: value for d, value in zip(cur.description, row)}


def audit(conn: sqlite3.Connection, coder_id: str | None, action: str,
          entity_type: str, entity_id: str, detail: dict | None = None) -> None:
    conn.execute(
        "INSERT INTO analytic_audit_log VALUES (?,?,?,?,?,?,?)",
        (str(uuid.uuid4()), coder_id, action, entity_type, entity_id,
         json.dumps(detail or {}, ensure_ascii=False), now()))


def source_record(conn: sqlite3.Connection, item_type: str,
                  item_id: str) -> tuple[str, str, dict]:
    if item_type == "comment":
        row = conn.execute(
            "SELECT thread_id, body, author, created_utc, permalink "
            "FROM corpus.comments WHERE id=?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(404, "source comment not found")
        return row[0], row[1] or "", {
            "author": row[2], "created_utc": row[3], "permalink": row[4]}
    if item_type == "thread":
        row = conn.execute(
            "SELECT id, selftext, author, created_utc, permalink "
            "FROM corpus.threads WHERE id=?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(404, "source thread not found")
        return row[0], row[1] or "", {
            "author": row[2], "created_utc": row[3], "permalink": row[4]}
    raise HTTPException(422, "item_type must be comment or thread")


def validate_span(text: str, start: int, end: int, selected: str) -> str:
    if start < 0 or end <= start or end > len(text):
        raise HTTPException(422, "selection offsets are outside the source text")
    if text[start:end] != selected:
        raise HTTPException(422, "selected_text does not match source offsets")
    left = max(0, start - 240)
    right = min(len(text), end + 240)
    return text[left:right]


def segment_payload(conn: sqlite3.Connection, segment_id: str) -> dict:
    cur = conn.execute("SELECT * FROM evidence_segments WHERE id=?", (segment_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "segment not found")
    result = row_dict(cur, row)
    code_cur = conn.execute(
        "SELECT c.id, c.name, c.description, c.color, c.codebook_id "
        "FROM segment_codes sc JOIN codes c ON c.id=sc.code_id "
        "WHERE sc.segment_id=? ORDER BY c.sort_order, c.name", (segment_id,))
    result["codes"] = [row_dict(code_cur, r) for r in code_cur.fetchall()]
    theme_cur = conn.execute(
        "SELECT t.id,t.name,t.memo,t.color,t.status FROM segment_themes st "
        "JOIN themes t ON t.id=st.theme_id WHERE st.segment_id=? "
        "ORDER BY t.created_at,t.name", (segment_id,))
    result["themes"] = [row_dict(theme_cur, r) for r in theme_cur.fetchall()]
    try:
        _, _, meta = source_record(conn, result["item_type"], result["item_id"])
    except HTTPException:
        meta = {"author": None, "created_utc": None, "permalink": None}
    result.update(meta)
    return result


class NewCodeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    color: str = Field(default="#32735f", pattern=r"^#[0-9a-fA-F]{6}$")


class CaptureIn(BaseModel):
    item_type: Literal["comment", "thread"] = "comment"
    item_id: str
    coder_id: str
    pass_no: int = Field(default=1, ge=1, le=2)
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    selected_text: str = Field(min_length=1)
    memo: str = Field(default="", max_length=5000)
    status: Literal[
        "captured", "coded", "uncertain", "excluded", "negative_case"
    ] = "captured"
    codebook_id: str
    code_ids: list[str] = Field(default_factory=list, max_length=50)
    new_code: NewCodeIn | None = None


@router.post("/capture", status_code=201)
def capture(body: CaptureIn,
            conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    if not conn.execute("SELECT 1 FROM coders WHERE id=?", (body.coder_id,)).fetchone():
        raise HTTPException(400, "coder_id does not exist")
    if not conn.execute("SELECT 1 FROM codebooks WHERE id=?", (body.codebook_id,)).fetchone():
        raise HTTPException(404, "codebook not found")
    thread_id, text, _ = source_record(conn, body.item_type, body.item_id)
    context = validate_span(
        text, body.start_offset, body.end_offset, body.selected_text)
    code_ids = list(dict.fromkeys(body.code_ids))
    if code_ids:
        placeholders = ",".join("?" * len(code_ids))
        found = conn.execute(
            f"SELECT id FROM codes WHERE codebook_id=? AND id IN ({placeholders})",
            [body.codebook_id, *code_ids]).fetchall()
        if len(found) != len(code_ids):
            raise HTTPException(422, "all codes must exist in the selected codebook")

    created_code = None
    timestamp = now()
    try:
        if body.new_code:
            name = body.new_code.name.strip()
            if not name:
                raise HTTPException(422, "code name cannot be blank")
            duplicate = conn.execute(
                "SELECT id FROM codes WHERE codebook_id=? AND name=? COLLATE NOCASE",
                (body.codebook_id, name)).fetchone()
            if duplicate:
                raise HTTPException(409, "a code with this name already exists")
            code_id = str(uuid.uuid4())
            order = conn.execute(
                "SELECT COALESCE(MAX(sort_order),-1)+1 FROM codes WHERE codebook_id=?",
                (body.codebook_id,)).fetchone()[0]
            conn.execute(
                "INSERT INTO codes (id,codebook_id,parent_id,name,description,color,"
                "valence,hotkey,sort_order) VALUES (?,?,NULL,?,?,?,NULL,NULL,?)",
                (code_id, body.codebook_id, name,
                 body.new_code.description.strip(), body.new_code.color, order))
            code_ids.append(code_id)
            created_code = code_id

        segment_id = str(uuid.uuid4())
        status = "coded" if code_ids and body.status == "captured" else body.status
        conn.execute(
            "INSERT INTO evidence_segments "
            "(id,item_type,item_id,thread_id,coder_id,pass_no,start_offset,"
            "end_offset,selected_text,context_text,memo,status,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (segment_id, body.item_type, body.item_id, thread_id, body.coder_id,
             body.pass_no, body.start_offset, body.end_offset, body.selected_text,
             context, body.memo.strip(), status, timestamp, timestamp))
        for code_id in code_ids:
            conn.execute("INSERT INTO segment_codes VALUES (?,?,?)",
                         (segment_id, code_id, timestamp))
        audit(conn, body.coder_id, "capture", "segment", segment_id, {
            "item_id": body.item_id, "code_ids": code_ids,
            "created_code_id": created_code})
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    result = segment_payload(conn, segment_id)
    result["created_code_id"] = created_code
    return result


@router.get("/segments")
def list_segments(coder_id: str, pass_no: int = Query(ge=1, le=2),
                  thread_id: str | None = None, code_id: str | None = None,
                  conn: sqlite3.Connection = Depends(get_conn)) -> list:
    where = ["s.coder_id=?", "s.pass_no=?"]
    args: list = [coder_id, pass_no]
    if thread_id:
        where.append("s.thread_id=?")
        args.append(thread_id)
    if code_id:
        where.append("EXISTS (SELECT 1 FROM segment_codes f WHERE "
                     "f.segment_id=s.id AND f.code_id=?)")
        args.append(code_id)
    ids = conn.execute(
        "SELECT s.id FROM evidence_segments s WHERE " + " AND ".join(where) +
        " ORDER BY s.created_at DESC", args).fetchall()
    return [segment_payload(conn, row[0]) for row in ids]


class SegmentUpdateIn(BaseModel):
    memo: str = Field(default="", max_length=5000)
    status: Literal[
        "captured", "coded", "uncertain", "excluded", "negative_case"]


@router.put("/segments/{segment_id}")
def update_segment(segment_id: str, body: SegmentUpdateIn,
                   conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    row = conn.execute(
        "SELECT coder_id FROM evidence_segments WHERE id=?", (segment_id,)).fetchone()
    if not row:
        raise HTTPException(404, "segment not found")
    conn.execute(
        "UPDATE evidence_segments SET memo=?,status=?,updated_at=? WHERE id=?",
        (body.memo.strip(), body.status, now(), segment_id))
    audit(conn, row[0], "update", "segment", segment_id,
          {"status": body.status})
    conn.commit()
    return segment_payload(conn, segment_id)


@router.delete("/segments/{segment_id}", status_code=204)
def delete_segment(segment_id: str,
                   conn: sqlite3.Connection = Depends(get_conn)) -> None:
    row = conn.execute(
        "SELECT coder_id FROM evidence_segments WHERE id=?", (segment_id,)).fetchone()
    if not row:
        raise HTTPException(404, "segment not found")
    conn.execute("DELETE FROM evidence_segments WHERE id=?", (segment_id,))
    audit(conn, row[0], "delete", "segment", segment_id)
    conn.commit()


@router.put("/segments/{segment_id}/codes/{code_id}", status_code=201)
def add_segment_code(segment_id: str, code_id: str, response: Response,
                     conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    segment = conn.execute(
        "SELECT coder_id FROM evidence_segments WHERE id=?", (segment_id,)).fetchone()
    if not segment:
        raise HTTPException(404, "segment not found")
    if not conn.execute("SELECT 1 FROM codes WHERE id=?", (code_id,)).fetchone():
        raise HTTPException(404, "code not found")
    existing = conn.execute(
        "SELECT 1 FROM segment_codes WHERE segment_id=? AND code_id=?",
        (segment_id, code_id)).fetchone()
    if existing:
        response.status_code = 200
    else:
        conn.execute("INSERT INTO segment_codes VALUES (?,?,?)",
                     (segment_id, code_id, now()))
        conn.execute("UPDATE evidence_segments SET status='coded',updated_at=? "
                     "WHERE id=?", (now(), segment_id))
        audit(conn, segment[0], "link", "segment_code", segment_id,
              {"code_id": code_id})
        conn.commit()
    return segment_payload(conn, segment_id)


@router.delete("/segments/{segment_id}/codes/{code_id}", status_code=204)
def remove_segment_code(segment_id: str, code_id: str,
                        conn: sqlite3.Connection = Depends(get_conn)) -> None:
    deleted = conn.execute(
        "DELETE FROM segment_codes WHERE segment_id=? AND code_id=?",
        (segment_id, code_id)).rowcount
    if not deleted:
        raise HTTPException(404, "segment-code link not found")
    remaining = conn.execute(
        "SELECT 1 FROM segment_codes WHERE segment_id=?", (segment_id,)).fetchone()
    if not remaining:
        conn.execute("UPDATE evidence_segments SET status='captured',updated_at=? "
                     "WHERE id=? AND status='coded'", (now(), segment_id))
    conn.commit()


@router.put("/segments/{segment_id}/themes/{theme_id}", status_code=201)
def add_segment_theme(segment_id: str, theme_id: str, response: Response,
                      conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    segment = conn.execute(
        "SELECT coder_id FROM evidence_segments WHERE id=?", (segment_id,)).fetchone()
    theme = conn.execute("SELECT id FROM themes WHERE id=?", (theme_id,)).fetchone()
    if not segment or not theme:
        raise HTTPException(404, "segment or theme not found")
    existing = conn.execute(
        "SELECT 1 FROM segment_themes WHERE segment_id=? AND theme_id=?",
        (segment_id, theme_id)).fetchone()
    if existing:
        response.status_code = 200
    else:
        conn.execute("INSERT INTO segment_themes VALUES (?,?,?)",
                     (segment_id, theme_id, now()))
        audit(conn, segment[0], "link", "segment_theme", segment_id,
              {"theme_id": theme_id})
        conn.commit()
    return segment_payload(conn, segment_id)


@router.delete("/segments/{segment_id}/themes/{theme_id}", status_code=204)
def remove_segment_theme(segment_id: str, theme_id: str,
                         conn: sqlite3.Connection = Depends(get_conn)) -> None:
    row = conn.execute(
        "SELECT coder_id FROM evidence_segments WHERE id=?", (segment_id,)).fetchone()
    if not row:
        raise HTTPException(404, "segment not found")
    deleted = conn.execute(
        "DELETE FROM segment_themes WHERE segment_id=? AND theme_id=?",
        (segment_id, theme_id)).rowcount
    if not deleted:
        raise HTTPException(404, "segment-theme link not found")
    audit(conn, row[0], "unlink", "segment_theme", segment_id,
          {"theme_id": theme_id})
    conn.commit()


class ThemeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    memo: str = Field(default="", max_length=10000)
    color: str = Field(default="#68568c", pattern=r"^#[0-9a-fA-F]{6}$")
    status: Literal["candidate", "reviewing", "retained", "rejected"] = "candidate"


def theme_payload(conn: sqlite3.Connection, theme_id: str) -> dict:
    cur = conn.execute("SELECT * FROM themes WHERE id=?", (theme_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "theme not found")
    result = row_dict(cur, row)
    code_cur = conn.execute(
        "SELECT c.*, (SELECT COUNT(*) FROM segment_codes sc WHERE sc.code_id=c.id) "
        "AS segment_count FROM theme_codes tc JOIN codes c ON c.id=tc.code_id "
        "WHERE tc.theme_id=? ORDER BY tc.sort_order,c.sort_order", (theme_id,))
    result["codes"] = [row_dict(code_cur, r) for r in code_cur.fetchall()]
    return result


@router.get("/themes")
def list_themes(codebook_id: str,
                conn: sqlite3.Connection = Depends(get_conn)) -> list:
    ids = conn.execute(
        "SELECT id FROM themes WHERE codebook_id=? ORDER BY created_at",
        (codebook_id,)).fetchall()
    return [theme_payload(conn, row[0]) for row in ids]


@router.post("/themes", status_code=201)
def create_theme(codebook_id: str, body: ThemeIn,
                 conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    if not body.name.strip():
        raise HTTPException(422, "theme name cannot be blank")
    if not conn.execute("SELECT 1 FROM codebooks WHERE id=?", (codebook_id,)).fetchone():
        raise HTTPException(404, "codebook not found")
    theme_id, timestamp = str(uuid.uuid4()), now()
    try:
        conn.execute("INSERT INTO themes VALUES (?,?,?,?,?,?,?,?)",
                     (theme_id, codebook_id, body.name.strip(), body.memo.strip(),
                      body.color, body.status, timestamp, timestamp))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "a theme with this name already exists") from None
    audit(conn, None, "create", "theme", theme_id, {"name": body.name.strip()})
    conn.commit()
    return theme_payload(conn, theme_id)


@router.put("/themes/{theme_id}")
def update_theme(theme_id: str, body: ThemeIn,
                 conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    if not body.name.strip():
        raise HTTPException(422, "theme name cannot be blank")
    try:
        updated = conn.execute(
            "UPDATE themes SET name=?,memo=?,color=?,status=?,updated_at=? WHERE id=?",
            (body.name.strip(), body.memo.strip(), body.color, body.status,
             now(), theme_id)).rowcount
    except sqlite3.IntegrityError:
        raise HTTPException(409, "a theme with this name already exists") from None
    if not updated:
        raise HTTPException(404, "theme not found")
    conn.commit()
    return theme_payload(conn, theme_id)


@router.delete("/themes/{theme_id}", status_code=204)
def delete_theme(theme_id: str,
                 conn: sqlite3.Connection = Depends(get_conn)) -> None:
    if not conn.execute("SELECT 1 FROM themes WHERE id=?", (theme_id,)).fetchone():
        raise HTTPException(404, "theme not found")
    conn.execute("DELETE FROM themes WHERE id=?", (theme_id,))
    audit(conn, None, "delete", "theme", theme_id)
    conn.commit()


@router.put("/themes/{theme_id}/codes/{code_id}", status_code=201)
def add_theme_code(theme_id: str, code_id: str, response: Response,
                   conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    theme = conn.execute(
        "SELECT codebook_id FROM themes WHERE id=?", (theme_id,)).fetchone()
    code = conn.execute("SELECT codebook_id FROM codes WHERE id=?", (code_id,)).fetchone()
    if not theme or not code:
        raise HTTPException(404, "theme or code not found")
    if theme[0] != code[0]:
        raise HTTPException(422, "theme and code must belong to the same codebook")
    existing = conn.execute(
        "SELECT 1 FROM theme_codes WHERE theme_id=? AND code_id=?",
        (theme_id, code_id)).fetchone()
    if existing:
        response.status_code = 200
    else:
        order = conn.execute(
            "SELECT COALESCE(MAX(sort_order),-1)+1 FROM theme_codes WHERE theme_id=?",
            (theme_id,)).fetchone()[0]
        conn.execute("INSERT INTO theme_codes VALUES (?,?,?,?)",
                     (theme_id, code_id, order, now()))
        conn.commit()
    return theme_payload(conn, theme_id)


@router.delete("/themes/{theme_id}/codes/{code_id}", status_code=204)
def remove_theme_code(theme_id: str, code_id: str,
                      conn: sqlite3.Connection = Depends(get_conn)) -> None:
    deleted = conn.execute(
        "DELETE FROM theme_codes WHERE theme_id=? AND code_id=?",
        (theme_id, code_id)).rowcount
    conn.commit()
    if not deleted:
        raise HTTPException(404, "theme-code link not found")
