"""Stage 2 — hydration. Expensive: full comment trees.

Gated on the num_comments floor AND the keyword rule. A thread below the floor
costs zero comment requests — that is the whole efficiency argument.
"""
from __future__ import annotations

import json
import logging

from . import corpus
from .tree import compute_depths

log = logging.getLogger(__name__)


def pending_threads(conn, min_comments: int) -> list[tuple[str, int]]:
    """Candidate, un-hydrated threads at/above the floor. Biggest trees first."""
    return conn.execute(
        "SELECT id, num_comments FROM threads "
        "WHERE is_candidate=1 AND hydrated=0 AND num_comments >= ? "
        "ORDER BY num_comments DESC", (min_comments,)).fetchall()


def pending_thread_ids(conn, thread_ids: list[str]) -> list[tuple[str, int]]:
    """Return unhydrated rows from an explicit, trusted selection."""
    unique_ids = list(dict.fromkeys(thread_ids))
    if not unique_ids:
        return []
    placeholders = ",".join("?" for _ in unique_ids)
    return conn.execute(
        f"SELECT id, num_comments FROM threads WHERE hydrated=0 "
        f"AND id IN ({placeholders}) ORDER BY num_comments DESC, id",
        unique_ids,
    ).fetchall()


def run_hydration(conn, client, config: dict,
                  thread_ids: list[str] | None = None) -> dict:
    s = config["settings"]
    todo = (pending_thread_ids(conn, thread_ids) if thread_ids is not None
            else pending_threads(conn, s["min_comments"]))
    stats = {"threads": 0, "comments": 0}
    for tid, n_expected in todo:
        try:
            raw = client.get_comments_paginated(
                tid, page_size=s.get("comment_page_size", 100),
                max_pages=s.get("max_comment_pages", 30))
        except Exception as e:
            log.warning("hydrate %s failed: %s", tid, e)
            continue
        n_fetched = len(raw)
        raw = [c for c in raw if c.get("id")]
        if len(raw) < n_fetched:
            log.warning("dropped %d comment(s) missing 'id' in thread %s",
                        n_fetched - len(raw), tid)
        depths = compute_depths(raw, tid)
        for c in raw:
            try:
                corpus.upsert_comment(conn, {
                    "id": c["id"], "thread_id": tid, "parent_id": c.get("parent_id"),
                    "author": c.get("author"), "body": c.get("body"),
                    "score": c.get("score"), "ups": c.get("ups"),
                    "downs": c.get("downs"),
                    "controversiality": c.get("controversiality"),
                    "is_submitter": int(bool(c.get("is_submitter"))),
                    "distinguished": c.get("distinguished"),
                    "stickied": int(bool(c.get("stickied"))),
                    "collapsed": int(bool(c.get("collapsed"))),
                    "created_utc": c.get("created_utc", 0.0),
                    "depth": depths.get(c["id"]),
                    "permalink": c.get("permalink"),
                    "raw_json": json.dumps(c),
                })
            except Exception as e:
                log.warning("skipping malformed comment %r in thread %s: %s",
                            c.get("id"), tid, e)
        corpus.mark_hydrated(conn, tid, len(raw))
        stats["threads"] += 1
        stats["comments"] += len(raw)
        log.info("hydrated %s: %d/%d comments", tid, len(raw), n_expected)
    return stats
