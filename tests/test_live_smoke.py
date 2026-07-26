import pytest

from thicket.arctic_shift import ArcticShiftClient
from thicket.tree import compute_depths

pytestmark = pytest.mark.live

UA = "thicket:live-smoke-test:v1"


def test_pagination_beats_the_old_100_cap_and_keeps_parent_id():
    cl = ArcticShiftClient(user_agent=UA, rate_limit_seconds=1.5)
    out = cl.get_comments_paginated("1m1uw9v", page_size=100, max_pages=8)
    assert len(out) > 400, f"expected deep pagination, got {len(out)}"
    assert all(c.get("parent_id") for c in out)
    depths = compute_depths(out, "1m1uw9v")
    assert any(d == 0 for d in depths.values())
    assert any(d > 0 for d in depths.values())
