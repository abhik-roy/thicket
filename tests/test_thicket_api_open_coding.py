import sqlite3

import pytest
from fastapi.testclient import TestClient

from thicket import corpus, db
from thicket.deps import get_conn
from thicket.main import app


@pytest.fixture
def client(tmp_path):
    labels_path = str(tmp_path / "labels.db")
    corpus_path = str(tmp_path / "corpus.db")
    cc = corpus.connect(corpus_path)
    corpus.upsert_thread(cc, {
        "id": "thread-1", "subreddit": "community", "tier": "discussion",
        "title": "Project discussion", "selftext": "Opening proposal",
        "author": "op", "score": 1, "num_comments": 1,
        "created_utc": 1.0, "permalink": "/t/1", "url": "/t/1",
        "matched_keywords": "[]", "matched_groups": "[]",
        "is_candidate": 1, "retrieved_at": "x", "raw_json": "{}",
    })
    corpus.upsert_comment(cc, {
        "id": "post-1", "thread_id": "thread-1", "parent_id": None,
        "author": "alice", "body": "AI use should be disclosed to reviewers.",
        "score": 1, "ups": 1, "downs": 0, "controversiality": 0,
        "is_submitter": 0, "distinguished": None, "stickied": 0,
        "collapsed": 0, "created_utc": 2.0, "depth": 0,
        "permalink": "/t/1/2", "raw_json": "{}",
    })
    cc.close()
    lc = db.connect_labels(labels_path)
    lc.execute("INSERT INTO coders VALUES ('analyst','Analyst','x')")
    lc.execute("INSERT INTO codebooks VALUES ('open','Open coding','',1,'x')")
    lc.execute("INSERT INTO codes VALUES "
               "('disclosure','open',NULL,'Requesting disclosure','',"
               "'#225544',NULL,NULL,0)")
    lc.commit()
    lc.close()

    def override():
        conn = db.connect_labels(labels_path)
        db.attach_corpus(conn, corpus_path)
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_conn] = override
    yield TestClient(app), labels_path
    app.dependency_overrides.clear()


def capture_payload(**overrides):
    text = "disclosed to reviewers"
    payload = {
        "item_type": "comment", "item_id": "post-1",
        "coder_id": "analyst", "pass_no": 1,
        "start_offset": 17, "end_offset": 17 + len(text),
        "selected_text": text, "memo": "Accountability mechanism",
        "status": "captured", "codebook_id": "open",
        "code_ids": ["disclosure"],
    }
    payload.update(overrides)
    return payload


def test_capture_exact_segment_with_existing_code(client):
    http, _ = client
    response = http.post("/open-coding/capture", json=capture_payload())
    assert response.status_code == 201, response.text
    segment = response.json()
    assert segment["selected_text"] == "disclosed to reviewers"
    assert segment["status"] == "coded"
    assert segment["codes"][0]["id"] == "disclosure"
    assert segment["author"] == "alice"

    listed = http.get(
        "/open-coding/segments?coder_id=analyst&pass_no=1&thread_id=thread-1")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [segment["id"]]


def test_capture_can_create_and_apply_open_code_atomically(client):
    http, labels_path = client
    response = http.post("/open-coding/capture", json=capture_payload(
        code_ids=[], new_code={"name": "Making AI use visible",
                               "description": "Disclosure as visibility",
                               "color": "#123456"}))
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["created_code_id"]
    assert result["codes"][0]["name"] == "Making AI use visible"
    with sqlite3.connect(labels_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM analytic_audit_log").fetchone()[0] == 1


def test_capture_rejects_mismatched_text_without_creating_code(client):
    http, labels_path = client
    response = http.post("/open-coding/capture", json=capture_payload(
        selected_text="not verbatim", end_offset=29,
        code_ids=[], new_code={"name": "Must not survive", "color": "#123456"}))
    assert response.status_code == 422
    with sqlite3.connect(labels_path) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM codes WHERE name='Must not survive'").fetchone()[0] == 0


def test_segment_code_links_and_safe_deletion(client):
    http, _ = client
    segment = http.post("/open-coding/capture", json=capture_payload(
        code_ids=[])).json()
    assert segment["status"] == "captured"
    linked = http.put(
        f"/open-coding/segments/{segment['id']}/codes/disclosure")
    assert linked.status_code == 201
    assert linked.json()["status"] == "coded"
    assert http.delete(
        f"/open-coding/segments/{segment['id']}/codes/disclosure").status_code == 204
    assert http.delete(
        f"/open-coding/segments/{segment['id']}").status_code == 204


def test_theme_many_to_many_code_membership(client):
    http, _ = client
    first = http.post("/open-coding/themes?codebook_id=open", json={
        "name": "Visible accountability", "memo": "Working concept",
        "color": "#654321", "status": "candidate",
    })
    second = http.post("/open-coding/themes?codebook_id=open", json={
        "name": "Review coordination", "memo": "Alternative reading",
        "color": "#223344", "status": "reviewing",
    })
    assert first.status_code == second.status_code == 201
    for theme in (first.json(), second.json()):
        linked = http.put(
            f"/open-coding/themes/{theme['id']}/codes/disclosure")
        assert linked.status_code == 201
        assert linked.json()["codes"][0]["id"] == "disclosure"
    themes = http.get("/open-coding/themes?codebook_id=open").json()
    assert len(themes) == 2
    assert all(t["codes"][0]["id"] == "disclosure" for t in themes)


def test_segment_can_be_organized_under_multiple_themes(client):
    http, _ = client
    segment = http.post("/open-coding/capture", json=capture_payload()).json()
    themes = [http.post("/open-coding/themes?codebook_id=open", json={
        "name": name, "memo": "", "color": "#654321", "status": "candidate",
    }).json() for name in ("Accountability", "Review practice")]
    for theme in themes:
        linked = http.put(
            f"/open-coding/segments/{segment['id']}/themes/{theme['id']}")
        assert linked.status_code == 201
    listed = http.get(
        "/open-coding/segments?coder_id=analyst&pass_no=1").json()[0]
    assert {theme["name"] for theme in listed["themes"]} == {
        "Accountability", "Review practice"}
    assert http.delete(
        f"/open-coding/segments/{segment['id']}/themes/{themes[0]['id']}"
    ).status_code == 204


def test_theme_rejects_cross_codebook_membership(client):
    http, labels_path = client
    with sqlite3.connect(labels_path) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("INSERT INTO codebooks VALUES ('other','Other','',1,'x')")
        conn.execute("INSERT INTO codes VALUES "
                     "('other-code','other',NULL,'Other','','#111111',NULL,NULL,0)")
        conn.commit()
    theme = http.post("/open-coding/themes?codebook_id=open", json={
        "name": "One", "memo": "", "color": "#654321",
        "status": "candidate",
    }).json()
    response = http.put(
        f"/open-coding/themes/{theme['id']}/codes/other-code")
    assert response.status_code == 422


def test_merge_code_moves_and_deduplicates_all_references(client):
    http, labels_path = client
    target = http.post("/codebooks/open/codes", json={
        "name": "Transparent assistance", "description": "Retained code",
        "color": "#123456", "hotkey": None,
    }).json()
    source_segment = http.post(
        "/open-coding/capture", json=capture_payload()).json()
    target_segment = http.post("/open-coding/capture", json=capture_payload(
        code_ids=[target["id"]])).json()
    theme = http.post("/open-coding/themes?codebook_id=open", json={
        "name": "Accountability", "memo": "", "color": "#654321",
        "status": "candidate",
    }).json()
    assert http.put(
        f"/open-coding/themes/{theme['id']}/codes/disclosure").status_code == 201
    assert http.put(
        f"/open-coding/themes/{theme['id']}/codes/{target['id']}").status_code == 201
    for code_id in ("disclosure", target["id"]):
        assert http.post("/labels", json={
            "item_type": "comment", "item_id": "post-1", "code_id": code_id,
            "coder_id": "analyst", "pass_no": 1,
        }).status_code == 201

    response = http.post("/codes/disclosure/merge", json={
        "target_code_id": target["id"],
    })
    assert response.status_code == 200, response.text
    assert response.json()["id"] == target["id"]
    with sqlite3.connect(labels_path) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM codes WHERE id='disclosure'").fetchone()[0] == 0
        assert conn.execute(
            "SELECT COUNT(*) FROM labels WHERE code_id=?", (target["id"],)
        ).fetchone()[0] == 1
        assert conn.execute(
            "SELECT COUNT(*) FROM segment_codes WHERE code_id=?", (target["id"],)
        ).fetchone()[0] == 2
        assert conn.execute(
            "SELECT COUNT(*) FROM theme_codes WHERE code_id=?", (target["id"],)
        ).fetchone()[0] == 1
    listed = http.get(
        "/open-coding/segments?coder_id=analyst&pass_no=1").json()
    by_id = {segment["id"]: segment for segment in listed}
    assert by_id[source_segment["id"]]["codes"][0]["id"] == target["id"]
    assert by_id[target_segment["id"]]["codes"][0]["id"] == target["id"]


def test_merge_rejects_codes_from_different_codebooks(client):
    http, labels_path = client
    with sqlite3.connect(labels_path) as conn:
        conn.execute("INSERT INTO codebooks VALUES ('other','Other','',1,'x')")
        conn.execute("INSERT INTO codes VALUES "
                     "('other-code','other',NULL,'Other','','#111111',NULL,NULL,0)")
        conn.commit()
    response = http.post("/codes/disclosure/merge", json={
        "target_code_id": "other-code",
    })
    assert response.status_code == 422


def test_split_code_moves_selected_segments_and_inherits_themes(client):
    http, labels_path = client
    first = http.post("/open-coding/capture", json=capture_payload()).json()
    second = http.post("/open-coding/capture", json=capture_payload()).json()
    theme = http.post("/open-coding/themes?codebook_id=open", json={
        "name": "Accountability", "memo": "", "color": "#654321",
        "status": "candidate",
    }).json()
    assert http.put(
        f"/open-coding/themes/{theme['id']}/codes/disclosure").status_code == 201

    response = http.post("/codes/disclosure/split", json={
        "name": "Disclosure burden", "description": "A narrower concept",
        "color": "#123456", "segment_ids": [first["id"]],
    })
    assert response.status_code == 201, response.text
    new_code = response.json()
    assert new_code["split_summary"]["moved_segment_links"] == 1
    with sqlite3.connect(labels_path) as conn:
        assert conn.execute(
            "SELECT code_id FROM segment_codes WHERE segment_id=?",
            (first["id"],)).fetchone()[0] == new_code["id"]
        assert conn.execute(
            "SELECT code_id FROM segment_codes WHERE segment_id=?",
            (second["id"],)).fetchone()[0] == "disclosure"
        assert conn.execute(
            "SELECT COUNT(*) FROM theme_codes WHERE theme_id=? AND code_id=?",
            (theme["id"], new_code["id"])).fetchone()[0] == 1


def test_split_code_rejects_segment_without_source_code(client):
    http, _ = client
    target = http.post("/codebooks/open/codes", json={
        "name": "Other", "description": "", "color": "#123456",
        "hotkey": None,
    }).json()
    segment = http.post("/open-coding/capture", json=capture_payload(
        code_ids=[target["id"]])).json()
    response = http.post("/codes/disclosure/split", json={
        "name": "Invalid split", "description": "", "color": "#654321",
        "segment_ids": [segment["id"]],
    })
    assert response.status_code == 422
