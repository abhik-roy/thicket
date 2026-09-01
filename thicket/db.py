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

CREATE TABLE IF NOT EXISTS evidence_segments (
  id            TEXT PRIMARY KEY,
  item_type     TEXT NOT NULL CHECK (item_type IN ('comment', 'thread')),
  item_id       TEXT NOT NULL,
  thread_id     TEXT NOT NULL,
  coder_id      TEXT NOT NULL REFERENCES coders(id),
  pass_no       INTEGER NOT NULL DEFAULT 1,
  start_offset  INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset    INTEGER NOT NULL CHECK (end_offset > start_offset),
  selected_text TEXT NOT NULL,
  context_text  TEXT NOT NULL,
  memo          TEXT,
  status        TEXT NOT NULL DEFAULT 'captured'
                CHECK (status IN ('captured','coded','uncertain','excluded','negative_case')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segments_source
  ON evidence_segments(thread_id, item_id, start_offset);
CREATE INDEX IF NOT EXISTS idx_segments_coder
  ON evidence_segments(coder_id, pass_no, created_at);

CREATE TABLE IF NOT EXISTS segment_codes (
  segment_id TEXT NOT NULL REFERENCES evidence_segments(id) ON DELETE CASCADE,
  code_id    TEXT NOT NULL REFERENCES codes(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (segment_id, code_id)
);

CREATE TABLE IF NOT EXISTS themes (
  id          TEXT PRIMARY KEY,
  codebook_id TEXT NOT NULL REFERENCES codebooks(id),
  name        TEXT NOT NULL,
  memo        TEXT,
  color       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'candidate'
              CHECK (status IN ('candidate','reviewing','retained','rejected')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_name
  ON themes(codebook_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS theme_codes (
  theme_id  TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  code_id   TEXT NOT NULL REFERENCES codes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (theme_id, code_id)
);

CREATE TABLE IF NOT EXISTS segment_themes (
  segment_id TEXT NOT NULL REFERENCES evidence_segments(id) ON DELETE CASCADE,
  theme_id   TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (segment_id, theme_id)
);

CREATE TABLE IF NOT EXISTS analytic_audit_log (
  id          TEXT PRIMARY KEY,
  coder_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL
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
