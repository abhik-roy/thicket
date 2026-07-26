from thicket import db
from thicket.seed_default import seed_default


def test_seed_default_creates_neutral_codebook(tmp_path):
    conn = db.connect_labels(str(tmp_path / "labels.db"))
    assert seed_default(conn, "2026-07-25T00:00:00Z") == 9
    assert seed_default(conn, "2026-07-25T00:00:00Z") == 0
    names = [row[0] for row in conn.execute(
        "SELECT name FROM codes WHERE codebook_id='default' "
        "ORDER BY sort_order")]
    assert names == [
        "Relevant", "Insight", "Evidence", "Question", "Agreement",
        "Disagreement", "Action item", "Risk or concern", "Other",
    ]
