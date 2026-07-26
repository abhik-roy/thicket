"""Client over the Arctic Shift Reddit archive API.

Arctic Shift (https://github.com/ArthurHeitmann/arctic_shift) is an independent,
post-Pushshift Reddit archive. It needs no Reddit API approval and is not
IP-blocked, and it returns Reddit-schema objects. Endpoints used:

  GET /posts/search?subreddit=&query=&sort=desc&limit=&after=&before=
  GET /comments/search?link_id=t3_<id>&limit=      (flat comment list per post)

Same interface as RedditClient: `search_subreddit` and `get_comments`.
`get_comments` returns a FLAT list of comment dicts (the collector reconstructs
depth from parent_id).
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

import requests

log = logging.getLogger(__name__)

BASE = "https://arctic-shift.photon-reddit.com/api"

_TIME_DELTAS = {
    "day": timedelta(days=1),
    "week": timedelta(weeks=1),
    "month": timedelta(days=30),
    "year": timedelta(days=365),
}


class ArcticShiftClient:
    def __init__(self, user_agent: str, rate_limit_seconds: float = 1.0,
                 max_retries: int = 4, timeout: int = 45):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})
        self.rate_limit_seconds = rate_limit_seconds
        self.max_retries = max_retries
        self.timeout = timeout
        self._last = 0.0

    def _throttle(self) -> None:
        wait = self.rate_limit_seconds - (time.time() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.time()

    def _get(self, path: str, params: dict):
        url = BASE + path
        for attempt in range(1, self.max_retries + 1):
            self._throttle()
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as e:
                log.warning("request error %s (attempt %d): %s", url, attempt, e)
                time.sleep(2 ** attempt)
                continue
            if resp.status_code == 200:
                try:
                    return resp.json()
                except ValueError:
                    return None
            if resp.status_code in (422, 429, 500, 502, 503, 504):
                # 422 shows up transiently on this API; retry with backoff
                delay = float(resp.headers.get("Retry-After") or 2 ** attempt)
                log.warning("HTTP %d from %s; backoff %.1fs (attempt %d)",
                            resp.status_code, url, delay, attempt)
                time.sleep(delay)
                continue
            log.error("HTTP %d from %s; giving up (%s)", resp.status_code, url,
                      resp.text[:150])
            return None
        log.error("exhausted retries for %s", url)
        return None

    @staticmethod
    def _after_date(time_filter: str) -> str | None:
        delta = _TIME_DELTAS.get(time_filter)
        if not delta:
            return None
        return (datetime.now(timezone.utc) - delta).strftime("%Y-%m-%d")

    def search_subreddit(self, subreddit: str, query: str, sort: str = "desc",
                         time_filter: str = "year", limit: int = 25,
                         max_pages: int = 1) -> list[dict]:
        """Full-text search of posts. Paginates by created_utc cursor (desc)."""
        results: list[dict] = []
        after = self._after_date(time_filter)
        before = None
        page_limit = min(limit, 100)
        for _ in range(max_pages):
            params = {"subreddit": subreddit, "query": query,
                      "sort": "desc", "limit": page_limit}
            if after:
                params["after"] = after
            if before:
                params["before"] = before
            data = self._get("/posts/search", params)
            items = (data or {}).get("data", [])
            if not items:
                break
            results.extend(items)
            if len(items) < page_limit:
                break
            before = min(int(i.get("created_utc", 0) or 0) for i in items)
        return results

    def search_window(self, subreddit: str, query: str, after: str, before: str,
                      limit: int = 50) -> list[dict]:
        """Search posts within an explicit [after, before] date window (YYYY-MM-DD).
        Shallow per-call (no deep pagination) → gentler on the API."""
        params = {"subreddit": subreddit, "query": query, "sort": "desc",
                  "limit": min(limit, 100), "after": after, "before": before}
        data = self._get("/posts/search", params)
        return (data or {}).get("data", [])

    def get_comments(self, post_id: str, permalink: str | None = None,
                     limit: int = 200) -> list[dict]:
        """Return a flat list of comment dicts for a post."""
        data = self._get("/comments/search",
                         {"link_id": f"t3_{post_id}", "limit": min(limit, 100)})
        return (data or {}).get("data", [])

    def get_comments_paginated(self, post_id: str, page_size: int = 100,
                               max_pages: int = 30) -> list[dict]:
        """Walk a post's FULL comment list.

        The API's `limit` caps a single RESPONSE, not the post. Paginate with
        sort=asc and an `after=<created_utc>` cursor. Verified 2026-07-17 on a
        1,118-comment thread.
        """
        seen: dict[str, dict] = {}
        after = None
        for _ in range(max_pages):
            params = {"link_id": f"t3_{post_id}", "limit": min(page_size, 100),
                      "sort": "asc"}
            if after is not None:
                params["after"] = after
            data = self._get("/comments/search", params)
            if data is None:
                raise RuntimeError(
                    f"Arctic Shift comment fetch failed for thread {post_id}"
                )
            items = (data or {}).get("data", [])
            if not items:
                break
            for c in items:
                seen[c["id"]] = c
            if len(items) < min(page_size, 100):
                break
            after = max(int(c.get("created_utc", 0) or 0) for c in items) - 1
        return list(seen.values())
