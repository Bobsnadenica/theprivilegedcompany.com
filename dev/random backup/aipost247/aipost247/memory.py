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
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at             TEXT    NOT NULL,
    content                TEXT    NOT NULL,
    fb_post_id             TEXT,
    status                 TEXT    NOT NULL DEFAULT 'published',
    model                  TEXT,
    likes                  INTEGER DEFAULT 0,
    comments               INTEGER DEFAULT 0,
    shares                 INTEGER DEFAULT 0,
    engagement_updated_at  TEXT
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
            self._migrate()
            self._conn.commit()

    def _migrate(self) -> None:
        """Add engagement columns to older databases that predate them."""
        existing = {row["name"] for row in self._conn.execute("PRAGMA table_info(posts)")}
        for column, ddl in (
            ("likes", "INTEGER DEFAULT 0"),
            ("comments", "INTEGER DEFAULT 0"),
            ("shares", "INTEGER DEFAULT 0"),
            ("engagement_updated_at", "TEXT"),
        ):
            if column not in existing:
                self._conn.execute(f"ALTER TABLE posts ADD COLUMN {column} {ddl}")

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

    def recent_posts_detailed(self, limit: int = 50) -> list[dict]:
        """Recent posts with engagement columns — for the dashboard monitor."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, created_at, content, status, fb_post_id, model, "
                "likes, comments, shares, engagement_updated_at "
                "FROM posts ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def stats(self) -> dict:
        """Summary counts for the dashboard status panel."""
        with self._lock:
            total = self._conn.execute("SELECT COUNT(*) AS c FROM posts").fetchone()["c"]
            by_status = {
                row["status"]: row["c"]
                for row in self._conn.execute(
                    "SELECT status, COUNT(*) AS c FROM posts GROUP BY status"
                )
            }
            last = self._conn.execute(
                "SELECT created_at FROM posts ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return {
            "total": total,
            "published": by_status.get("published", 0),
            "dry_run": by_status.get("dry_run", 0),
            "failed": by_status.get("failed", 0),
            "last_created_at": last["created_at"] if last else None,
        }

    # --- clearing --------------------------------------------------------
    def clear(self, *, posts: bool = True, instructions: bool = True,
              knowledge: bool = True) -> dict[str, int]:
        """Delete rows from the selected DB memory tables. Returns counts removed."""
        removed: dict[str, int] = {}
        with self._lock:
            for name, flag in (("posts", posts), ("instructions", instructions),
                               ("knowledge", knowledge)):
                if not flag:
                    continue
                removed[name] = self._conn.execute(
                    f"SELECT COUNT(*) AS c FROM {name}"  # table name is a fixed literal
                ).fetchone()["c"]
                self._conn.execute(f"DELETE FROM {name}")
            self._conn.commit()
        return removed

    def clear_learned_files(self, names=("business.md", "skill.md", "steering.md")) -> list[str]:
        """Delete the named auto-generated memory files. Returns names removed."""
        removed: list[str] = []
        for name in names:
            path = self.memory_dir / name
            try:
                if path.exists():
                    path.unlink()
                    removed.append(name)
            except OSError as exc:
                log.warning("Could not remove %s: %s", path, exc)
        return removed

    # --- engagement / self-improvement ----------------------------------
    def published_with_fb_ids(self, limit: int = 25) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, fb_post_id, content FROM posts "
                "WHERE status = 'published' AND fb_post_id IS NOT NULL "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def update_post_engagement(self, fb_post_id: str, likes: int, comments: int, shares: int) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE posts SET likes = ?, comments = ?, shares = ?, engagement_updated_at = ? "
                "WHERE fb_post_id = ?",
                (likes, comments, shares, self._now(), fb_post_id),
            )
            self._conn.commit()

    def top_posts_by_engagement(self, limit: int = 5) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT content, likes, comments, shares, "
                "(likes + 2 * comments + 3 * shares) AS score "
                "FROM posts WHERE status = 'published' "
                "ORDER BY score DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

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
    def read_business_file(self) -> str:
        path = self.memory_dir / "business.md"
        if path.exists():
            try:
                return path.read_text(encoding="utf-8").strip()
            except OSError as exc:
                log.warning("Could not read %s: %s", path, exc)
        return ""

    def read_skill_file(self) -> str:
        """The auto-learned 'what works' file (written from engagement)."""
        path = self.memory_dir / "skill.md"
        if path.exists():
            try:
                return path.read_text(encoding="utf-8").strip()
            except OSError as exc:
                log.warning("Could not read %s: %s", path, exc)
        return ""

    def read_steering_file(self) -> str:
        """The self-correcting style guide built from the owner's per-post feedback."""
        path = self.memory_dir / "steering.md"
        if path.exists():
            try:
                return path.read_text(encoding="utf-8").strip()
            except OSError as exc:
                log.warning("Could not read %s: %s", path, exc)
        return ""

    def write_steering_file(self, text: str) -> Path:
        """Persist the consolidated style guide (single source — no accumulation)."""
        path = self.memory_dir / "steering.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text((text or "").strip() + "\n", encoding="utf-8")
        return path

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

        business = self.read_business_file()
        if business:
            parts.append("## Business profile\n" + business)

        skill = self.read_skill_file()
        if skill:
            parts.append("## What works on this Page (learned from engagement)\n" + skill)

        steering = self.read_steering_file()
        if steering:
            parts.append(
                "## Style rules from the owner (AUTHORITATIVE — always follow these; "
                "they already reflect the owner's latest feedback and override anything "
                "older that conflicts)\n" + steering
            )

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
