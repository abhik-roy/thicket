"""Live kappa + adjudication queue. The pending-disagreements query reuses
kappa's a/b-CTE shape as a single SQL query, not a fetch-then-diff."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from thicket import kappa
from thicket.deps import get_conn

router = APIRouter()

_PENDING_QUERY = """
WITH a AS (
  SELECT item_id, MAX(CASE WHEN code_id = :code THEN 1 ELSE 0 END) AS present
  FROM labels WHERE item_type = :item_type AND coder_id = :coder_a
    AND pass_no = :pass_a
  GROUP BY item_id
),
b AS (
  SELECT item_id, MAX(CASE WHEN code_id = :code THEN 1 ELSE 0 END) AS present
  FROM labels WHERE item_type = :item_type AND coder_id = :coder_b
    AND pass_no = :pass_b
  GROUP BY item_id
)
SELECT a.item_id FROM a JOIN b USING (item_id)
WHERE a.present != b.present
  AND NOT EXISTS (
    SELECT 1 FROM adjudications adj
    WHERE adj.item_type = :item_type AND adj.item_id = a.item_id
      AND adj.code_id = :code
  )
ORDER BY a.item_id
"""


@router.get("/codebooks/{codebook_id}/kappa")
def get_kappa(codebook_id: str, item_type: str, code_id: str, coder_a: str,
             pass_a: int, coder_b: str, pass_b: int,
             conn: sqlite3.Connection = Depends(get_conn)) -> dict:
    return kappa.compute_kappa(conn, item_type, code_id, coder_a, pass_a,
                               coder_b, pass_b)


@router.get("/codebooks/{codebook_id}/adjudications/pending")
def pending_adjudications(codebook_id: str, item_type: str, code_id: str,
                          coder_a: str, pass_a: int, coder_b: str,
                          pass_b: int,
                          conn: sqlite3.Connection = Depends(get_conn)
                          ) -> list:
    rows = conn.execute(_PENDING_QUERY, {
        "code": code_id, "item_type": item_type,
        "coder_a": coder_a, "pass_a": pass_a,
        "coder_b": coder_b, "pass_b": pass_b,
    }).fetchall()
    return [{"item_id": r[0]} for r in rows]


class AdjudicationIn(BaseModel):
    item_type: str
    item_id: str
    code_id: str
    decision: int
    resolved_by: str
    rationale: str | None = None


@router.post("/adjudications", status_code=201)
def create_adjudication(body: AdjudicationIn,
                        conn: sqlite3.Connection = Depends(get_conn)
                        ) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT OR REPLACE INTO adjudications (item_type, item_id, code_id, "
        "decision, resolved_by, rationale, resolved_at) VALUES "
        "(?,?,?,?,?,?,?)",
        (body.item_type, body.item_id, body.code_id, body.decision,
         body.resolved_by, body.rationale, now))
    conn.commit()
    return {"item_type": body.item_type, "item_id": body.item_id,
            "code_id": body.code_id, "decision": body.decision}
