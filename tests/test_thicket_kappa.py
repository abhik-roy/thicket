from thicket import db, kappa


def _label(conn, item_id, code_id, coder_id, pass_no):
    conn.execute(
        "INSERT INTO labels (id, item_type, item_id, code_id, coder_id, "
        "pass_no, created_at) VALUES (?,?,?,?,?,?,?)",
        (f"{item_id}:{code_id}:{coder_id}:{pass_no}", "thread", item_id,
         code_id, coder_id, pass_no, "2026-07-18T00:00:00Z"))


def _setup(conn):
    conn.execute("INSERT INTO coders VALUES ('a','A','x')")
    conn.execute("INSERT INTO coders VALUES ('b','B','x')")
    conn.execute("INSERT INTO codebooks VALUES ('cb','Test','',1,'x')")
    conn.execute("INSERT INTO codes VALUES ('include','cb',NULL,"
                 "'include','','#0f0',NULL,NULL,0)")
    conn.execute("INSERT INTO codes VALUES ('exclude','cb',NULL,"
                 "'exclude','','#f00',NULL,NULL,1)")
    conn.commit()


def test_perfect_agreement_gives_kappa_one(tmp_path):
    conn = db.connect_labels(str(tmp_path / "l.db"))
    _setup(conn)
    for i in range(10):
        code = "include" if i < 6 else "exclude"
        _label(conn, f"t{i}", code, "a", 1)
        _label(conn, f"t{i}", code, "b", 1)
    conn.commit()
    r = kappa.compute_kappa(conn, "thread", "include", "a", 1, "b", 1)
    assert r["n"] == 10
    assert r["agree"] == 10
    assert r["kappa"] == 1.0


def test_disagreement_lowers_kappa(tmp_path):
    conn = db.connect_labels(str(tmp_path / "l.db"))
    _setup(conn)
    for i in range(10):
        code = "include" if i < 6 else "exclude"
        _label(conn, f"t{i}", code, "a", 1)
    # coder b disagrees on t0 (a says include, b says exclude)
    for i in range(10):
        code = "exclude" if i == 0 else ("include" if i < 6 else "exclude")
        _label(conn, f"t{i}", code, "b", 1)
    conn.commit()
    r = kappa.compute_kappa(conn, "thread", "include", "a", 1, "b", 1)
    assert r["n"] == 10
    assert r["agree"] == 9
    assert 0.0 < r["kappa"] < 1.0


def test_population_is_items_both_coders_touched(tmp_path):
    conn = db.connect_labels(str(tmp_path / "l.db"))
    _setup(conn)
    _label(conn, "t0", "include", "a", 1)
    _label(conn, "t0", "include", "b", 1)
    # t1 only labeled by a -- must NOT count toward n
    _label(conn, "t1", "include", "a", 1)
    conn.commit()
    r = kappa.compute_kappa(conn, "thread", "include", "a", 1, "b", 1)
    assert r["n"] == 1


def test_different_pass_numbers_are_isolated(tmp_path):
    conn = db.connect_labels(str(tmp_path / "l.db"))
    _setup(conn)
    _label(conn, "t0", "include", "a", 1)
    _label(conn, "t0", "include", "b", 2)  # different pass -- not comparable
    conn.commit()
    r = kappa.compute_kappa(conn, "thread", "include", "a", 1, "b", 1)
    assert r["n"] == 0
