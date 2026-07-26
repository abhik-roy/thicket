"""Reply-tree reconstruction from parent_id.

`depth` is a derived view. parent_id is the source of truth.
"""
from __future__ import annotations

ORPHAN = -1


def compute_depths(comments: list[dict], thread_id: str) -> dict[str, int]:
    """Map comment id -> depth. Top-level = 0. Orphans/cycles = -1.

    Input order is irrelevant; resolution is by memoized walk.
    """
    by_id = {c["id"]: c for c in comments}
    root = f"t3_{thread_id}"
    depths: dict[str, int] = {}

    def resolve(cid: str, seen: set[str]) -> int:
        if cid in depths:
            return depths[cid]
        if cid in seen:          # cycle — malformed, treat as orphan
            return ORPHAN
        parent = by_id[cid].get("parent_id")
        if parent == root:
            d = 0
        elif not parent or not parent.startswith("t1_"):
            d = ORPHAN
        else:
            pid = parent[3:]
            if pid not in by_id:  # deleted parent — real and common
                d = ORPHAN
            else:
                pd = resolve(pid, seen | {cid})
                d = ORPHAN if pd == ORPHAN else pd + 1
        depths[cid] = d
        return d

    for c in comments:
        resolve(c["id"], set())
    return depths
