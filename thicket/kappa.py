"""Cohen's kappa via one SQL aggregate query, not a Python loop over rows.

The population is items BOTH coders touched (have >=1 label row for, any
code) in their respective (coder, pass) -- not every item in the table.
"""
from __future__ import annotations

import sqlite3

_QUERY = """
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
SELECT
  COUNT(*) AS n,
  SUM(CASE WHEN a.present = b.present THEN 1 ELSE 0 END) AS agree,
  SUM(CASE WHEN a.present = 1 AND b.present = 1 THEN 1 ELSE 0 END) AS yy,
  SUM(CASE WHEN a.present = 0 AND b.present = 0 THEN 1 ELSE 0 END) AS nn,
  SUM(CASE WHEN a.present = 1 AND b.present = 0 THEN 1 ELSE 0 END) AS yn,
  SUM(CASE WHEN a.present = 0 AND b.present = 1 THEN 1 ELSE 0 END) AS ny
FROM a JOIN b USING (item_id)
"""


def compute_kappa(conn: sqlite3.Connection, item_type: str, code_id: str,
                  coder_a: str, pass_a: int, coder_b: str, pass_b: int) -> dict:
    row = conn.execute(_QUERY, {
        "code": code_id, "item_type": item_type,
        "coder_a": coder_a, "pass_a": pass_a,
        "coder_b": coder_b, "pass_b": pass_b,
    }).fetchone()
    n, agree, yy, nn, yn, ny = row
    if not n:
        return {"n": 0, "agree": 0, "po": 0.0, "pe": 0.0, "kappa": 0.0}
    po = agree / n
    p_a_yes = (yy + yn) / n
    p_b_yes = (yy + ny) / n
    pe = p_a_yes * p_b_yes + (1 - p_a_yes) * (1 - p_b_yes)
    kappa_val = 1.0 if pe == 1.0 else (po - pe) / (1 - pe)
    return {"n": n, "agree": agree, "po": po, "pe": pe, "kappa": kappa_val}
