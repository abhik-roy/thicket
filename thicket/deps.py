"""Dependency-injection surface: DB connection + settings.

Deliberately has NO dependency on thicket.main or any router, so it can
always be imported first with no ordering requirement. main.py and every
router import get_conn/Settings FROM HERE, never from thicket.main --
that keeps main.py free to import routers at the top of the file like
any normal module.
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from thicket import db
from thicket.config import Settings

__all__ = ["Settings", "get_conn"]


def get_conn() -> Iterator[sqlite3.Connection]:
    settings = Settings()
    conn = db.connect_labels(settings.labels_db)
    db.attach_corpus(conn, settings.corpus_db)
    try:
        yield conn
    finally:
        conn.close()
