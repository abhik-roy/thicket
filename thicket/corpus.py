"""SQLite corpus store. Machine-written, reproducible, freely replaceable.

Rule: raw_json is ALWAYS persisted. `depth` is derived from parent_id and can be
recomputed; parent_id itself cannot be recovered without a re-scrape.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  subreddit TEXT NOT NULL,
  tier TEXT NOT NULL,
  title TEXT NOT NULL,
  selftext TEXT,
  author TEXT,
  score INTEGER,
  num_comments INTEGER,
  created_utc REAL NOT NULL,
  permalink TEXT,
  url TEXT,
  matched_keywords TEXT,
  matched_groups TEXT,
  is_candidate INTEGER NOT NULL DEFAULT 0,
  hydrated INTEGER NOT NULL DEFAULT 0,
  n_comments_fetched INTEGER NOT NULL DEFAULT 0,
  retrieved_at TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  parent_id TEXT,
  author TEXT,
  body TEXT,
  score INTEGER,
  ups INTEGER,
  downs INTEGER,
  controversiality INTEGER,
  is_submitter INTEGER,
  distinguished TEXT,
  stickied INTEGER,
  collapsed INTEGER,
  created_utc REAL NOT NULL,
  depth INTEGER,
  permalink TEXT,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE TABLE IF NOT EXISTS search_hits (
  thread_id TEXT NOT NULL REFERENCES threads(id),
  query TEXT NOT NULL,
  found_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, query)
);
CREATE TABLE IF NOT EXISTS fetch_log (
  subreddit TEXT NOT NULL,
  query TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  status TEXT NOT NULL,
  n_found INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (subreddit, query, window_start, window_end)
);
"""

_THREAD_COLS = ["id", "subreddit", "tier", "title", "selftext", "author", "score",
                "num_comments", "created_utc", "permalink", "url",
                "matched_keywords", "matched_groups", "is_candidate",
                "retrieved_at", "raw_json"]

_COMMENT_COLS = ["id", "thread_id", "parent_id", "author", "body", "score", "ups",
                 "downs", "controversiality", "is_submitter", "distinguished",
                 "stickied", "collapsed", "created_utc", "depth", "permalink",
                 "raw_json"]


def connect(path: str) -> sqlite3.Connection:
    Path(path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


def _coerce(value):
    if isinstance(value, (list, dict)):
        return json.dumps(value)
    if isinstance(value, bool):
        return int(value)
    return value


def _upsert(conn, table: str, cols: list[str], row: dict) -> None:
    vals = [_coerce(row.get(c)) for c in cols]
    placeholders = ",".join("?" * len(cols))
    updates = ",".join(f"{c}=excluded.{c}" for c in cols if c != "id")
    conn.execute(
        f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {updates}", vals)
    conn.commit()


def upsert_thread(conn, thread: dict) -> None:
    _upsert(conn, "threads", _THREAD_COLS, thread)


def upsert_comment(conn, comment: dict) -> None:
    _upsert(conn, "comments", _COMMENT_COLS, comment)


def record_hit(conn, thread_id: str, query: str, found_at: str) -> None:
    conn.execute("INSERT OR IGNORE INTO search_hits (thread_id, query, found_at) "
                 "VALUES (?,?,?)", (thread_id, query, found_at))
    conn.commit()


def log_window(conn, subreddit, query, window_start, window_end, status,
               n_found) -> None:
    from datetime import datetime, timezone
    conn.execute(
        "INSERT OR REPLACE INTO fetch_log (subreddit, query, window_start, "
        "window_end, status, n_found, fetched_at) VALUES (?,?,?,?,?,?,?)",
        (subreddit, query, window_start, window_end, status, n_found,
         datetime.now(timezone.utc).isoformat()))
    conn.commit()


def window_done(conn, subreddit, query, window_start, window_end) -> bool:
    row = conn.execute(
        "SELECT 1 FROM fetch_log WHERE subreddit=? AND query=? AND "
        "window_start=? AND window_end=? AND status='done'",
        (subreddit, query, window_start, window_end)).fetchone()
    return row is not None


def mark_hydrated(conn, thread_id: str, n: int) -> None:
    conn.execute("UPDATE threads SET hydrated=1, n_comments_fetched=? WHERE id=?",
                 (n, thread_id))
    conn.commit()
