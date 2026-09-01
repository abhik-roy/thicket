import pytest
from fastapi.testclient import TestClient

from thicket.deps import get_conn
from thicket.main import app
from thicket import corpus, db


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "l.db")
    corpus_path = str(tmp_path / "corpus.db")
    corpus_conn = corpus.connect(corpus_path)
    corpus_conn.execute(
        "INSERT INTO threads (id,subreddit,tier,title,selftext,author,score,"
        "num_comments,created_utc,permalink,url,matched_keywords,matched_groups,"
        "is_candidate,hydrated,n_comments_fetched,retrieved_at,raw_json) "
        "VALUES ('t1','test','core','Title','','Thread author',0,1,1,'/t1','',"
        "'','',0,1,1,'x','{}')")
    corpus_conn.execute(
        "INSERT INTO comments VALUES ('p1','t1','t3_t1','Comment author',"
        "'Some selected evidence',0,0,0,0,0,NULL,0,0,2,0,'/p1','{}')")
    corpus_conn.commit()
    corpus_conn.close()
    conn = db.connect_labels(db_path)
    conn.execute("INSERT INTO coders VALUES ('a','Alice','x')")
    conn.execute("INSERT INTO codebooks VALUES ('cb','Test','',1,'x')")
    conn.execute("INSERT INTO codes VALUES ('inc','cb',NULL,'include','',"
                "'#0f0',NULL,NULL,0)")
    conn.execute("INSERT INTO labels VALUES ('l1','thread','t1','inc','a',"
                "1,'a note','2026-07-18T00:00:00Z')")
    conn.execute(
        "INSERT INTO evidence_segments VALUES ('s1','comment','p1','t1','a',1,"
        "5,13,'selected','Some selected evidence','analytic memo','coded',"
        "'2026-07-18T00:00:00Z','2026-07-18T00:00:00Z')")
    conn.execute("INSERT INTO segment_codes VALUES ('s1','inc','x')")
    conn.commit()
    conn.close()

    # TestClient dispatches sync dependencies on a different OS thread than
    # this fixture; sqlite3 connections are thread-affined by default, so
    # open a fresh connection to the same on-disk file per call instead of
    # reusing one already-open `conn` (see tests/test_thicket_api_labels.py).
    def override_conn():
        c = db.connect_labels(db_path)
        db.attach_corpus(c, corpus_path)
        try:
            yield c
        finally:
            c.close()

    app.dependency_overrides[get_conn] = override_conn
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_export_jsonl(client):
    resp = client.get("/export?codebook_id=cb&format=jsonl")
    assert resp.status_code == 200
    lines = [l for l in resp.text.strip().split("\n") if l]
    assert len(lines) == 1
    import json
    row = json.loads(lines[0])
    assert row["item_id"] == "t1"
    assert row["code_name"] == "include"
    assert row["coder_name"] == "Alice"


def test_export_csv(client):
    resp = client.get("/export?codebook_id=cb&format=csv")
    assert resp.status_code == 200
    assert "item_id" in resp.text.splitlines()[0]
    assert "t1" in resp.text


def test_export_rejects_unknown_format(client):
    resp = client.get("/export?codebook_id=cb&format=xml")
    assert resp.status_code == 400


def test_export_segments_csv_includes_source_and_analysis(client):
    resp = client.get(
        "/export/segments?codebook_id=cb&coder_id=a&pass_no=1")
    assert resp.status_code == 200
    assert 'filename="thicket-segments-a-pass-1.csv"' in resp.headers[
        "content-disposition"]
    import csv
    import io
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert len(rows) == 1
    assert rows[0]["selected_text"] == "selected"
    assert rows[0]["codes"] == "include"
    assert rows[0]["author"] == "Comment author"
    assert rows[0]["memo"] == "analytic memo"


def test_export_segments_pdf_is_a_styled_download(client):
    resp = client.get(
        "/export/segments?codebook_id=cb&coder_id=a&pass_no=1&format=pdf")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")
    assert 'filename="thicket-segments-a-pass-1.pdf"' in resp.headers[
        "content-disposition"]
