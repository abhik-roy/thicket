import pytest

from thicket.arctic_shift import ArcticShiftClient


class FakeClient(ArcticShiftClient):
    """Stubs _get so pagination logic is tested without network."""

    def __init__(self, pages):
        self._pages = pages
        self.calls = []

    def _get(self, path, params):
        self.calls.append(params)
        if not self._pages:
            return {"data": []}
        return {"data": self._pages.pop(0)}


def _c(i, ts):
    return {"id": f"c{i}", "created_utc": ts, "parent_id": "t3_XX"}


def test_paginates_until_short_page():
    page1 = [_c(i, 1000 + i) for i in range(100)]
    page2 = [_c(i, 1100 + i) for i in range(100, 130)]
    cl = FakeClient([page1, page2])
    out = cl.get_comments_paginated("XX", page_size=100)
    assert len(out) == 130
    assert cl.calls[0].get("after") is None
    assert cl.calls[1]["after"] == 1098   # max created_utc of page1, stepped back by 1


def test_dedupes_overlapping_pages():
    page1 = [_c(i, 1000 + i) for i in range(100)]
    page2 = [_c(99, 1099)] + [_c(i, 1100 + i) for i in range(100, 105)]
    cl = FakeClient([page1, page2])
    out = cl.get_comments_paginated("XX", page_size=100)
    assert len(out) == 105
    assert len({c["id"] for c in out}) == 105


def test_respects_max_pages_safety_valve():
    pages = [[_c(i, 1000 + i + p * 100) for i in range(p * 100, (p + 1) * 100)]
             for p in range(10)]
    cl = FakeClient(pages)
    out = cl.get_comments_paginated("XX", page_size=100, max_pages=3)
    assert len(cl.calls) == 3
    assert len(out) == 300


def test_empty_thread_returns_empty():
    cl = FakeClient([[]])
    assert cl.get_comments_paginated("XX") == []


def test_transport_failure_is_not_misreported_as_empty_thread(monkeypatch):
    cl = ArcticShiftClient("test", rate_limit_seconds=0)
    monkeypatch.setattr(cl, "_get", lambda *_args, **_kwargs: None)
    with pytest.raises(RuntimeError, match="comment fetch failed"):
        cl.get_comments_paginated("XX")


def test_cursor_steps_back_one_to_avoid_losing_same_second_ties():
    # Arctic Shift's `after` filter is EXCLUSIVE (created_utc > after, confirmed
    # empirically 2026-07-17 against the live API). If page 1 ends mid-tie-group
    # (multiple comments sharing the exact same created_utc at the truncation
    # point) and `after` were set to that tied timestamp, any tied comment NOT
    # in page 1 would be permanently unreachable. Stepping back by 1 forces the
    # whole tie-group to be re-fetched (and deduped) on page 2.
    tie_ts = 5000
    page1 = [_c(i, 1000 + i) for i in range(97)] + [_c(97, tie_ts), _c(98, tie_ts), _c(99, tie_ts)]
    page2 = [_c(i, tie_ts + 1) for i in range(100, 105)]
    cl = FakeClient([page1, page2])
    out = cl.get_comments_paginated("XX", page_size=100)
    assert cl.calls[1]["after"] == tie_ts - 1
    assert len(out) == 105
