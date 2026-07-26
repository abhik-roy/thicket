"""Seed a neutral starter codebook for general qualitative analysis."""
from __future__ import annotations

DEFAULT_CODES: list[tuple[str, str, str]] = [
    ("relevant", "Relevant", "#2563eb"),
    ("insight", "Insight", "#7c3aed"),
    ("evidence", "Evidence", "#0891b2"),
    ("question", "Question", "#ca8a04"),
    ("agreement", "Agreement", "#16a34a"),
    ("disagreement", "Disagreement", "#dc2626"),
    ("action", "Action item", "#ea580c"),
    ("risk", "Risk or concern", "#be123c"),
    ("other", "Other", "#64748b"),
]


def seed_default(conn, now: str) -> int:
    conn.execute(
        "INSERT OR IGNORE INTO codebooks "
        "(id, name, description, version, created_at) VALUES "
        "('default', 'General qualitative coding', "
        "'Neutral starter codes for exploratory thread analysis', 1, ?)",
        (now,),
    )
    created = 0
    for index, (code_id, name, color) in enumerate(DEFAULT_CODES):
        if conn.execute("SELECT 1 FROM codes WHERE id=?", (code_id,)).fetchone():
            continue
        conn.execute(
            "INSERT INTO codes (id, codebook_id, parent_id, name, "
            "description, color, valence, hotkey, sort_order) VALUES "
            "(?,'default',NULL,?,NULL,?,NULL,?,?)",
            (code_id, name, color, str(index + 1), index),
        )
        created += 1
    conn.commit()
    return created
