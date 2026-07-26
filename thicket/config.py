"""Runtime configuration. No study-specific constants live here or
anywhere in thicket/ -- DB paths and the default codebook are the only
per-deployment knobs, all env-driven, per the reusability decision."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass
class Settings:
    corpus_db: str = None
    labels_db: str = None

    def __post_init__(self):
        if self.corpus_db is None:
            self.corpus_db = os.environ.get("THICKET_CORPUS_DB",
                                            "data/corpus.db")
        if self.labels_db is None:
            self.labels_db = os.environ.get("THICKET_LABELS_DB",
                                            "data/labels.db")
