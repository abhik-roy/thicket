"""Persistent local workspace configuration."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


def settings_file() -> Path:
    return Path(os.environ.get(
        "THICKET_SETTINGS_FILE", "data/thicket-settings.json",
    )).expanduser().resolve()


def _stored_paths() -> dict[str, str]:
    path = settings_file()
    if not path.exists():
        return {}
    try:
        body = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {
        key: value for key, value in body.items()
        if key in {"corpus_db", "labels_db"} and isinstance(value, str)
    }


def save_settings(corpus_db: str, labels_db: str) -> None:
    path = settings_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps({
        "corpus_db": str(Path(corpus_db).expanduser().resolve()),
        "labels_db": str(Path(labels_db).expanduser().resolve()),
    }, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


@dataclass
class Settings:
    corpus_db: str = None
    labels_db: str = None

    def __post_init__(self):
        stored = _stored_paths()
        if self.corpus_db is None:
            self.corpus_db = stored.get(
                "corpus_db",
                os.environ.get("THICKET_CORPUS_DB", "data/corpus.db"),
            )
        if self.labels_db is None:
            self.labels_db = stored.get(
                "labels_db",
                os.environ.get("THICKET_LABELS_DB", "data/labels.db"),
            )
        self.corpus_db = str(Path(self.corpus_db).expanduser().resolve())
        self.labels_db = str(Path(self.labels_db).expanduser().resolve())
