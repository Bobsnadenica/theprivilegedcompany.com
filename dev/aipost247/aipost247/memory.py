"""Local "skill / memory" store.

Two complementary layers act as the program's context:

  * SQLite database (data/aipost247.db) — structured history: published posts,
    instructions added via the CLI, and knowledge snippets.
  * memory/ folder — human-editable plain text:
        memory/instructions.md     -> brand voice / standing instructions
        memory/knowledge/*.md|*.txt -> domain knowledge files

``build_context()`` blends both layers (plus recent posts, so the model avoids
repeating itself) into a single prompt for the content generator.
"""
from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from .logging_setup import get_logger

log = get_logger("memory")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    fb_post_id  TEXT,
    status      TEXT    NOT NULL DEFAULT 'published',
    model       TEXT
);
CREATE TABLE IF NOT EXISTS instructions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT    NOT NULL,
    text        TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT    NOT NULL,
    topic       TEXT,
    text        TEXT    NOT NULL
);
"""


class MemoryStore:
    """Thread-safe wrapper around the SQLite DB + the memory/ text folder."""

    def __init__(self, db_path: str, memory_dir: str) -> None:
        self.db_path = str(db_path)
        self.memory_dir = Path(memory_dir)
        self.knowledge_dir = self.memory_dir / "knowledge"
        self._lock = threading.Lock()
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    # --- writes ----------------------------------------------------------
    def add_post(self, content, fb_post_id=None, status="published", model=None) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO posts (created_at, content, fb_post_id, status, model) "
                "VALUES (?, ?, ?, ?, ?)",
                (self._now(), content, fb_post_id, status, model),
            )
            self._conn.commit()

    def add_instruction(self, text: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO instructions (created_at, text) VALUES (?, ?)",
                (self._now(), text),
            )
            self._conn.commit()

    def add_knowledge(self, text: str, topic: str | None = None) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO knowledge (created_at, topic, text) VALUES (?, ?, ?)",
                (self._now(), topic, text),
            )
            self._conn.commit()

    # --- reads -----------------------------------------------------------
    def recent_posts(self, limit: int = 8) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT content, created_at, status FROM posts ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def count_posts(self) -> int:
        with self._lock:
            return self._conn.execute("SELECT COUNT(*) AS c FROM posts").fetchone()["c"]

    def get_instructions(self, limit: int = 50) -> list[str]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT text FROM instructions ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [row["text"] for row in rows]

    def get_knowledge_records(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT topic, text FROM knowledge ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

    # --- folder layer ----------------------------------------------------
    def read_instructions_file(self) -> str:
        path = self.memory_dir / "instructions.md"
        if path.exists():
            try:
                return path.read_text(encoding="utf-8").strip()
            except OSError as exc:
                log.warning("Could not read %s: %s", path, exc)
        return ""

    def read_knowledge_files(self, max_chars: int = 4000) -> str:
        chunks: list[str] = []
        total = 0
        if self.knowledge_dir.exists():
            for path in sorted(self.knowledge_dir.glob("*")):
                if path.suffix.lower() not in {".md", ".txt"}:
                    continue
                try:
                    text = path.read_text(encoding="utf-8").strip()
                except OSError as exc:
                    log.warning("Could not read %s: %s", path, exc)
                    continue
                if not text:
                    continue
                chunks.append(f"[{path.name}]\n{text}")
                total += len(text)
                if total >= max_chars:
                    break
        return "\n\n".join(chunks)[:max_chars]

    # --- context ---------------------------------------------------------
    def build_context(self, max_recent: int = 8, max_knowledge_chars: int = 4000) -> str:
        """Blend every memory layer into a single prompt for the generator."""
        parts: list[str] = []

        instructions_file = self.read_instructions_file()
        if instructions_file:
            parts.append("## Brand voice & standing instructions\n" + instructions_file)

        db_instructions = self.get_instructions()
        if db_instructions:
            parts.append(
                "## Additional instructions\n"
                + "\n".join(f"- {item}" for item in db_instructions)
            )

        knowledge_blocks: list[str] = []
        knowledge_file = self.read_knowledge_files(max_knowledge_chars)
        if knowledge_file:
            knowledge_blocks.append(knowledge_file)
        knowledge_records = self.get_knowledge_records()
        if knowledge_records:
            knowledge_blocks.append(
                "\n".join(
                    f"- {('[' + r['topic'] + '] ') if r['topic'] else ''}{r['text']}"
                    for r in knowledge_records
                )
            )
        if knowledge_blocks:
            parts.append("## Domain knowledge\n" + "\n\n".join(knowledge_blocks))

        recent = self.recent_posts(max_recent)
        if recent:
            parts.append(
                "## Recent posts — do NOT repeat these; write something clearly different\n"
                + "\n".join(f"- {row['content']}" for row in recent)
            )

        parts.append(
            "## Your task\n"
            "Write ONE brand-new Facebook post now. It must reflect the brand voice, "
            "be genuinely engaging or useful to the audience, and be clearly different "
            "from the recent posts listed above."
        )
        return "\n\n".join(parts)

    def close(self) -> None:
        with self._lock:
            self._conn.close()
