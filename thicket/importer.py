"""On-demand Arctic Shift collection into a local Thicket corpus."""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone

from thicket import corpus
from thicket.arctic_shift import ArcticShiftClient
from thicket.hydrate import run_hydration


def import_threads(
    corpus_path: str,
    subreddit: str,
    query: str,
    limit: int = 25,
    hydrate: bool = True,
    rate_limit_seconds: float = 1.5,
) -> dict:
    """Search Arctic Shift, store every match, and optionally fetch replies."""
    subreddit = subreddit.strip().removeprefix("r/").strip("/")
    query = query.strip()
    if not subreddit:
        raise ValueError("subreddit is required")
    if not query:
        raise ValueError("query is required")

    client = ArcticShiftClient(
        user_agent="thicket:local-qualitative-research:v1",
        rate_limit_seconds=rate_limit_seconds,
    )
    posts = client.search_subreddit(
        subreddit=subreddit,
        query=query,
        time_filter="all",
        limit=limit,
        max_pages=max(1, math.ceil(limit / 100)),
    )[:limit]
    now = datetime.now(timezone.utc).isoformat()
    conn = corpus.connect(corpus_path)
    ids: list[str] = []
    try:
        for post in posts:
            thread_id = post.get("id")
            if not thread_id:
                continue
            ids.append(thread_id)
            corpus.upsert_thread(conn, {
                "id": thread_id,
                "subreddit": post.get("subreddit") or subreddit,
                "tier": "imported",
                "title": post.get("title", ""),
                "selftext": post.get("selftext") or "",
                "author": post.get("author"),
                "score": post.get("score"),
                "num_comments": post.get("num_comments", 0),
                "created_utc": post.get("created_utc", 0.0),
                "permalink": post.get("permalink"),
                "url": post.get("url"),
                "matched_keywords": [],
                "matched_groups": [],
                "is_candidate": 1,
                "retrieved_at": now,
                "raw_json": json.dumps(post),
            })
            corpus.record_hit(conn, thread_id, query, now)

        hydration = {"threads": 0, "comments": 0}
        if hydrate and ids:
            hydration = run_hydration(
                conn,
                client,
                {"settings": {
                    "min_comments": 0,
                    "comment_page_size": 100,
                    "max_comment_pages": 30,
                }},
                thread_ids=ids,
            )
        return {
            "matched": len(posts),
            "stored": len(ids),
            "hydrated": hydration["threads"],
            "comments": hydration["comments"],
            "thread_ids": ids,
        }
    finally:
        conn.close()
