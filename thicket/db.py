"""labels.db connection + schema, and read-only corpus.db attachment.

labels.db is human-written and irreplaceable: never overwritten on deploy.
corpus.db is machine-written and reproducible: attached READ-ONLY so a bug
here can never corrupt scraped data. The read-only attach REQUIRES
`uri=True` on the main connection -- verified empirically 2026-07-18 (and
re-verified during Task 1 review): without it, SQLite doesn't recognize the
`file:...?mode=ro` string in the ATTACH statement as a URI at all and the
attach fails outright with "unable to open database" -- not a silent
write-success. Either way, `uri=True` is required for the attach to work
as intended; omit it and the read-only guarantee (and the attach itself)
is gone.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS coders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS codebooks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS codes (
  id          TEXT PRIMARY KEY,
  codebook_id TEXT NOT NULL REFERENCES codebooks(id),
  parent_id   TEXT REFERENCES codes(id),
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL,
  valence     TEXT,
  hotkey      TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS labels (
  id         TEXT PRIMARY KEY,
  item_type  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  code_id    TEXT NOT NULL REFERENCES codes(id),
  coder_id   TEXT NOT NULL REFERENCES coders(id),
  pass_no    INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (item_type, item_id, code_id, coder_id, pass_no)
);
CREATE INDEX IF NOT EXISTS idx_labels_item ON labels(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_labels_coder_pass ON labels(coder_id, pass_no);

CREATE TABLE IF NOT EXISTS assignments (
  coder_id  TEXT NOT NULL REFERENCES coders(id),
  item_type TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  pass_no   INTEGER NOT NULL,
  status    TEXT NOT NULL,
  PRIMARY KEY (coder_id, item_type, item_id, pass_no)
);

CREATE TABLE IF NOT EXISTS adjudications (
  item_type   TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  code_id     TEXT NOT NULL REFERENCES codes(id),
  decision    INTEGER NOT NULL,
  resolved_by TEXT NOT NULL REFERENCES coders(id),
  rationale   TEXT,
  resolved_at TEXT NOT NULL,
  PRIMARY KEY (item_type, item_id, code_id)
);
"""


def connect_labels(path: str) -> sqlite3.Connection:
    # FastAPI may enter a sync generator dependency, execute its endpoint, and
    # finalize the generator on different worker threads. The connection is
    # still scoped to one request, but SQLite's default thread affinity would
    # make otherwise valid concurrent requests fail intermittently with 500s.
    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, uri=True, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def attach_corpus(conn: sqlite3.Connection, corpus_path: str) -> None:
    uri = f"file:{Path(corpus_path).expanduser().resolve()}?mode=ro"
    conn.execute("ATTACH DATABASE ? AS corpus", (uri,))
