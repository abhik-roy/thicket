"""Codebooks, codes, and labels -- with blindness enforced in SQL."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from thicket.deps import get_conn

router = APIRouter()


def _row_to_dict(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {d[0]: v for d, v in zip(cursor.description, row)}


@router.get("/codebooks")
def list_codebooks(conn: sqlite3.Connection = Depends(get_conn)) -> list:
    cur = conn.execute(
        "SELECT cb.*, "
        "(SELECT COUNT(*) FROM labels l JOIN codes c ON c.id=l.code_id "
        " WHERE c.codebook_id=cb.id) + "
        "(SELECT COUNT(*) FROM segment_codes sc JOIN codes c ON c.id=sc.code_id "
        " WHERE c.codebook_id=cb.id) AS label_count "
        "FROM codebooks cb ORDER BY cb.id")
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


@router.get("/codebooks/{codebook_id}/codes")
def list_codes(codebook_id: str,
               conn: sqlite3.Connection = Depends(get_conn)) -> list:
    cur = conn.execute(
        "SELECT * FROM codes WHERE codebook_id = ? ORDER BY sort_order",
        (codebook_id,))
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


class CodebookIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)


@router.post("/codebooks", status_code=201)
def create_codebook(body: CodebookIn,
                    conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    if not body.name.strip():
        raise HTTPException(422, "codebook name cannot be blank")
    codebook_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO codebooks "
        "(id, name, description, version, created_at) VALUES (?,?,?,?,?)",
        (codebook_id, body.name.strip(), body.description.strip(), 1, now))
    conn.commit()
    cur = conn.execute("SELECT * FROM codebooks WHERE id=?", (codebook_id,))
    return _row_to_dict(cur, cur.fetchone())


@router.delete("/codebooks/{codebook_id}", status_code=204)
def delete_codebook(codebook_id: str,
                    conn: sqlite3.Connection = Depends(get_conn)) -> None:
    if codebook_id == "default":
        raise HTTPException(400, "the default codebook cannot be deleted")
    used = conn.execute(
        "SELECT 1 FROM labels l JOIN codes c ON c.id=l.code_id "
        "WHERE c.codebook_id=? LIMIT 1", (codebook_id,)).fetchone()
    if used:
        raise HTTPException(409, "codebook has labels and cannot be deleted")
    conn.execute("DELETE FROM codes WHERE codebook_id=?", (codebook_id,))
    deleted = conn.execute(
        "DELETE FROM codebooks WHERE id=?", (codebook_id,)).rowcount
    conn.commit()
    if not deleted:
        raise HTTPException(404, "codebook not found")


class CodeIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    hotkey: str | None = Field(default=None, pattern=r"^[1-9]$")


class CodeMergeIn(BaseModel):
    target_code_id: str = Field(min_length=1)


class CodeSplitIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    segment_ids: list[str] = Field(min_length=1, max_length=10000)


@router.post("/codebooks/{codebook_id}/codes", status_code=201)
def create_code(codebook_id: str, body: CodeIn,
                conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    if not body.name.strip():
        raise HTTPException(422, "code name cannot be blank")
    if not conn.execute(
            "SELECT 1 FROM codebooks WHERE id=?", (codebook_id,)).fetchone():
        raise HTTPException(404, "codebook not found")
    if body.hotkey and conn.execute(
            "SELECT 1 FROM codes WHERE codebook_id=? AND hotkey=?",
            (codebook_id, body.hotkey)).fetchone():
        raise HTTPException(409, "hotkey is already used in this codebook")
    code_id = str(uuid.uuid4())
    sort_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM codes "
        "WHERE codebook_id=?", (codebook_id,)).fetchone()[0]
    conn.execute(
        "INSERT INTO codes (id, codebook_id, parent_id, name, description, "
        "color, valence, hotkey, sort_order) VALUES (?,?,NULL,?,?,?,NULL,?,?)",
        (code_id, codebook_id, body.name.strip(), body.description.strip(),
         body.color, body.hotkey, sort_order))
    conn.commit()
    cur = conn.execute("SELECT * FROM codes WHERE id=?", (code_id,))
    return _row_to_dict(cur, cur.fetchone())


@router.put("/codes/{code_id}")
def update_code(code_id: str, body: CodeIn,
                conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    if not body.name.strip():
        raise HTTPException(422, "code name cannot be blank")
    existing = conn.execute(
        "SELECT codebook_id FROM codes WHERE id=?", (code_id,)).fetchone()
    if not existing:
        raise HTTPException(404, "code not found")
    if conn.execute(
            "SELECT 1 FROM codes WHERE codebook_id=? AND id<>? "
            "AND name=? COLLATE NOCASE",
            (existing[0], code_id, body.name.strip())).fetchone():
        raise HTTPException(409, "a code with this name already exists")
    if body.hotkey and conn.execute(
            "SELECT 1 FROM codes WHERE codebook_id=? AND hotkey=? AND id<>?",
            (existing[0], body.hotkey, code_id)).fetchone():
        raise HTTPException(409, "hotkey is already used in this codebook")
    updated = conn.execute(
        "UPDATE codes SET name=?, description=?, color=?, hotkey=? "
        "WHERE id=?",
        (body.name.strip(), body.description.strip(), body.color,
         body.hotkey, code_id)).rowcount
    conn.commit()
    cur = conn.execute("SELECT * FROM codes WHERE id=?", (code_id,))
    return _row_to_dict(cur, cur.fetchone())


@router.post("/codes/{source_code_id}/merge")
def merge_code(source_code_id: str, body: CodeMergeIn,
               conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    """Merge a source code into a retained target across every coding layer."""
    if source_code_id == body.target_code_id:
        raise HTTPException(400, "source and target codes must be different")
    rows = conn.execute(
        "SELECT id,codebook_id,parent_id FROM codes WHERE id IN (?,?)",
        (source_code_id, body.target_code_id)).fetchall()
    by_id = {row[0]: row for row in rows}
    if source_code_id not in by_id or body.target_code_id not in by_id:
        raise HTTPException(404, "source or target code not found")
    if by_id[source_code_id][1] != by_id[body.target_code_id][1]:
        raise HTTPException(422, "codes must belong to the same codebook")

    try:
        duplicate_labels = conn.execute(
            "DELETE FROM labels AS source WHERE source.code_id=? AND EXISTS ("
            "SELECT 1 FROM labels AS target WHERE target.code_id=? "
            "AND target.item_type=source.item_type "
            "AND target.item_id=source.item_id "
            "AND target.coder_id=source.coder_id "
            "AND target.pass_no=source.pass_no)",
            (source_code_id, body.target_code_id)).rowcount
        moved_labels = conn.execute(
            "UPDATE labels SET code_id=? WHERE code_id=?",
            (body.target_code_id, source_code_id)).rowcount

        moved_segments = conn.execute(
            "INSERT OR IGNORE INTO segment_codes (segment_id,code_id,created_at) "
            "SELECT segment_id,?,created_at FROM segment_codes WHERE code_id=?",
            (body.target_code_id, source_code_id)).rowcount
        conn.execute("DELETE FROM segment_codes WHERE code_id=?", (source_code_id,))

        moved_themes = conn.execute(
            "INSERT OR IGNORE INTO theme_codes (theme_id,code_id,sort_order,created_at) "
            "SELECT theme_id,?,sort_order,created_at FROM theme_codes WHERE code_id=?",
            (body.target_code_id, source_code_id)).rowcount
        conn.execute("DELETE FROM theme_codes WHERE code_id=?", (source_code_id,))
        if by_id[body.target_code_id][2] == source_code_id:
            conn.execute("UPDATE codes SET parent_id=? WHERE id=?",
                         (by_id[source_code_id][2], body.target_code_id))
        conn.execute("UPDATE codes SET parent_id=? WHERE parent_id=? AND id<>?",
                     (body.target_code_id, source_code_id, body.target_code_id))
        conn.execute("DELETE FROM codes WHERE id=?", (source_code_id,))
        timestamp = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO analytic_audit_log VALUES (?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), None, "merge", "code", source_code_id,
             json.dumps({"target_code_id": body.target_code_id}), timestamp))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    cur = conn.execute("SELECT * FROM codes WHERE id=?", (body.target_code_id,))
    result = _row_to_dict(cur, cur.fetchone())
    result["merge_summary"] = {
        "moved_labels": moved_labels,
        "deduplicated_labels": duplicate_labels,
        "moved_segment_links": moved_segments,
        "moved_theme_links": moved_themes,
    }
    return result


@router.post("/codes/{source_code_id}/split", status_code=201)
def split_code(source_code_id: str, body: CodeSplitIn,
               conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    """Create a sibling code and move reviewed evidence links onto it."""
    source = conn.execute(
        "SELECT codebook_id,parent_id FROM codes WHERE id=?",
        (source_code_id,)).fetchone()
    if not source:
        raise HTTPException(404, "source code not found")
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "code name cannot be blank")
    if conn.execute(
            "SELECT 1 FROM codes WHERE codebook_id=? AND name=? COLLATE NOCASE",
            (source[0], name)).fetchone():
        raise HTTPException(409, "a code with this name already exists")
    segment_ids = list(dict.fromkeys(body.segment_ids))
    placeholders = ",".join("?" * len(segment_ids))
    linked = conn.execute(
        f"SELECT segment_id FROM segment_codes WHERE code_id=? "
        f"AND segment_id IN ({placeholders})",
        [source_code_id, *segment_ids]).fetchall()
    if len(linked) != len(segment_ids):
        raise HTTPException(
            422, "every selected segment must currently have the source code")

    code_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    sort_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order),-1)+1 FROM codes WHERE codebook_id=?",
        (source[0],)).fetchone()[0]
    try:
        conn.execute(
            "INSERT INTO codes (id,codebook_id,parent_id,name,description,color,"
            "valence,hotkey,sort_order) VALUES (?,?,?,?,?,?,NULL,NULL,?)",
            (code_id, source[0], source[1], name, body.description.strip(),
             body.color, sort_order))
        conn.executemany(
            "INSERT INTO segment_codes (segment_id,code_id,created_at) "
            "VALUES (?,?,?)",
            [(segment_id, code_id, timestamp) for segment_id in segment_ids])
        conn.execute(
            f"DELETE FROM segment_codes WHERE code_id=? "
            f"AND segment_id IN ({placeholders})",
            [source_code_id, *segment_ids])
        conn.execute(
            "INSERT INTO theme_codes (theme_id,code_id,sort_order,created_at) "
            "SELECT theme_id,?,sort_order,? FROM theme_codes WHERE code_id=?",
            (code_id, timestamp, source_code_id))
        conn.execute(
            "INSERT INTO analytic_audit_log VALUES (?,?,?,?,?,?,?)",
            (str(uuid.uuid4()), None, "split", "code", source_code_id,
             json.dumps({"new_code_id": code_id,
                         "segment_ids": segment_ids}), timestamp))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    cur = conn.execute("SELECT * FROM codes WHERE id=?", (code_id,))
    result = _row_to_dict(cur, cur.fetchone())
    result["split_summary"] = {
        "moved_segment_links": len(segment_ids),
        "whole_post_labels_left_on_source": conn.execute(
            "SELECT COUNT(*) FROM labels WHERE code_id=?",
            (source_code_id,)).fetchone()[0],
    }
    return result


@router.delete("/codes/{code_id}", status_code=204)
def delete_code(code_id: str,
                conn: sqlite3.Connection = Depends(get_conn)) -> None:
    if conn.execute(
            "SELECT 1 FROM labels WHERE code_id=? LIMIT 1",
            (code_id,)).fetchone():
        raise HTTPException(409, "code has labels and cannot be deleted")
    deleted = conn.execute("DELETE FROM codes WHERE id=?", (code_id,)).rowcount
    conn.commit()
    if not deleted:
        raise HTTPException(404, "code not found")


class LabelIn(BaseModel):
    item_type: str
    item_id: str
    code_id: str
    coder_id: str
    pass_no: int = Field(default=1, ge=1, le=2)
    note: str | None = None


@router.post("/labels", status_code=201)
def create_label(body: LabelIn, response: Response,
                 conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    existing = conn.execute(
        "SELECT id FROM labels WHERE item_type=? AND item_id=? AND "
        "code_id=? AND coder_id=? AND pass_no=?",
        (body.item_type, body.item_id, body.code_id, body.coder_id,
         body.pass_no)).fetchone()
    if existing:
        response.status_code = 200
        label_id = existing[0]
    else:
        label_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            conn.execute(
                "INSERT INTO labels (id, item_type, item_id, code_id, "
                "coder_id, pass_no, note, created_at) VALUES "
                "(?,?,?,?,?,?,?,?)",
                (label_id, body.item_type, body.item_id, body.code_id,
                 body.coder_id, body.pass_no, body.note, now))
        except sqlite3.IntegrityError as e:
            if "FOREIGN KEY" not in str(e):
                raise  # a different integrity error (e.g. a UNIQUE-
                       # constraint race on a near-simultaneous duplicate
                       # POST) is not "code_id/coder_id doesn't exist" and
                       # should surface as a real 500, not be misreported
            raise HTTPException(
                status_code=400,
                detail="code_id or coder_id does not exist") from None
        conn.commit()
    cur = conn.execute("SELECT * FROM labels WHERE id=?", (label_id,))
    return _row_to_dict(cur, cur.fetchone())


@router.delete("/labels/{label_id}", status_code=204)
def delete_label(label_id: str,
                 conn: sqlite3.Connection = Depends(get_conn)) -> None:
    conn.execute("DELETE FROM labels WHERE id=?", (label_id,))
    conn.commit()


@router.get("/items/{item_type}/{item_id}/labels")
def get_item_labels(item_type: str, item_id: str, coder_id: str,
                    pass_no: int,
                    conn: sqlite3.Connection = Depends(get_conn)) -> list:
    """Blindness enforced here: WHERE coder_id=? AND pass_no=? excludes
    every other coder AND every other pass, including the requester's own
    labels from a different pass."""
    cur = conn.execute(
        "SELECT * FROM labels WHERE item_type=? AND item_id=? AND "
        "coder_id=? AND pass_no=? ORDER BY id",
        (item_type, item_id, coder_id, pass_no))
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


@router.get("/coders/{coder_id}/coded-status")
def coded_status(coder_id: str, pass_no: int, item_type: str,
                 item_ids: str = Query(""),
                 conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    """Batch lookup so the grid needs one call per page, not N+1. Blind by
    construction: coder_id in the URL is exactly the coder_id the query
    filters on, so a request for coder A's status can never surface coder
    B's rows."""
    ids = [i for i in item_ids.split(",") if i]
    if len(ids) > 200:
        raise HTTPException(
            status_code=400,
            detail="at most 200 item_ids per request")
    if not ids:
        return {}
    placeholders = ",".join("?" * len(ids))
    cur = conn.execute(
        f"SELECT DISTINCT item_id FROM labels WHERE coder_id = ? AND "
        f"pass_no = ? AND item_type = ? AND item_id IN ({placeholders})",
        [coder_id, pass_no, item_type, *ids])
    coded = {row[0] for row in cur.fetchall()}
    return {i: (i in coded) for i in ids}


@router.get("/coders/{coder_id}/label-details")
def label_details(coder_id: str, pass_no: int, item_type: str,
                  item_ids: str = Query(""),
                  conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    """Like coded-status, but returns each applied label's own id alongside
    its code_id (a comment can carry more than one code, and the label id
    is what the frontend needs to delete a specific one) instead of a
    boolean. Same blindness construction as coded-status: coder_id in the
    URL is exactly the coder_id the query filters on."""
    ids = [i for i in item_ids.split(",") if i]
    if len(ids) > 200:
        raise HTTPException(
            status_code=400,
            detail="at most 200 item_ids per request")
    result: dict = {i: [] for i in ids}
    if not ids:
        return result
    placeholders = ",".join("?" * len(ids))
    cur = conn.execute(
        f"SELECT item_id, id, code_id FROM labels WHERE coder_id = ? AND "
        f"pass_no = ? AND item_type = ? AND item_id IN ({placeholders})",
        [coder_id, pass_no, item_type, *ids])
    for item_id, label_id, code_id in cur.fetchall():
        result[item_id].append({"label_id": label_id, "code_id": code_id})
    return result


@router.get("/coders/{coder_id}/assignment-status")
def assignment_status(coder_id: str, pass_no: int, item_type: str,
                      item_ids: str = Query(""),
                      conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    """Same shape as coded-status, but checks assignments.status='done'
    instead of labels -- this is what the triage grid's checkmark and the
    reply-tree's done indicator use, since coding now lives on comments
    while threads carry a done-marker."""
    ids = [i for i in item_ids.split(",") if i]
    if len(ids) > 200:
        raise HTTPException(
            status_code=400,
            detail="at most 200 item_ids per request")
    if not ids:
        return {}
    placeholders = ",".join("?" * len(ids))
    cur = conn.execute(
        f"SELECT item_id FROM assignments WHERE coder_id = ? AND "
        f"pass_no = ? AND item_type = ? AND status = 'done' AND "
        f"item_id IN ({placeholders})",
        [coder_id, pass_no, item_type, *ids])
    done = {row[0] for row in cur.fetchall()}
    return {i: (i in done) for i in ids}


@router.get("/coders")
def list_coders(conn: sqlite3.Connection = Depends(get_conn)) -> list:
    cur = conn.execute("SELECT * FROM coders ORDER BY id")
    return [_row_to_dict(cur, r) for r in cur.fetchall()]


class CoderIn(BaseModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=100)


@router.post("/coders", status_code=201)
def create_coder(body: CoderIn, response: Response,
                 conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    existing = conn.execute(
        "SELECT id FROM coders WHERE id=?", (body.id,)).fetchone()
    if existing:
        response.status_code = 200
    else:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO coders (id, name, created_at) VALUES (?,?,?)",
            (body.id, body.name, now))
        conn.commit()
    cur = conn.execute("SELECT * FROM coders WHERE id=?", (body.id,))
    return _row_to_dict(cur, cur.fetchone())


class AssignmentIn(BaseModel):
    coder_id: str
    item_type: str
    item_id: str
    pass_no: int = Field(default=1, ge=1, le=2)
    status: Literal["pending", "done"]


@router.post("/assignments", status_code=201)
def create_assignment(body: AssignmentIn, response: Response,
                      conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    existing = conn.execute(
        "SELECT status FROM assignments WHERE coder_id=? AND item_type=? "
        "AND item_id=? AND pass_no=?",
        (body.coder_id, body.item_type, body.item_id,
         body.pass_no)).fetchone()
    if existing:
        response.status_code = 200
        conn.execute(
            "UPDATE assignments SET status=? WHERE coder_id=? AND "
            "item_type=? AND item_id=? AND pass_no=?",
            (body.status, body.coder_id, body.item_type, body.item_id,
             body.pass_no))
        conn.commit()
    else:
        try:
            conn.execute(
                "INSERT INTO assignments (coder_id, item_type, item_id, "
                "pass_no, status) VALUES (?,?,?,?,?)",
                (body.coder_id, body.item_type, body.item_id, body.pass_no,
                 body.status))
        except sqlite3.IntegrityError as e:
            if "FOREIGN KEY" not in str(e):
                raise
            raise HTTPException(
                status_code=400,
                detail="coder_id does not exist") from None
        conn.commit()
    cur = conn.execute(
        "SELECT * FROM assignments WHERE coder_id=? AND item_type=? AND "
        "item_id=? AND pass_no=?",
        (body.coder_id, body.item_type, body.item_id, body.pass_no))
    return _row_to_dict(cur, cur.fetchone())
