"""Self-improvement loop.

Reads engagement (likes / comments / shares) for past posts via the Graph API,
stores it, and writes ``memory/skill.md`` describing what performed best. That
file is fed back into the prompt (see MemoryStore.build_context), so the AI
writes better posts over time based on what actually worked.
"""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .facebook_client import FacebookError
from .logging_setup import get_logger

log = get_logger("engagement")

DEFAULT_AUTO_LIMIT = 8
DEFAULT_AUTO_MIN_INTERVAL_MINUTES = 30


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def should_sync(memory, min_interval_minutes: int = DEFAULT_AUTO_MIN_INTERVAL_MINUTES) -> bool:
    """True when the automatic engagement refresh is old enough to run again."""
    last = _parse_ts(memory.latest_engagement_updated_at())
    if not last:
        return True
    return datetime.now(timezone.utc) - last >= timedelta(minutes=min_interval_minutes)


def sync(memory, fb, limit: int = DEFAULT_AUTO_LIMIT) -> int:
    """Refresh stored engagement for recent published posts. Returns # updated."""
    updated = 0
    for post in memory.published_with_fb_ids(limit):
        try:
            stats = fb.get_post_engagement(post["fb_post_id"])
        except FacebookError as exc:
            log.debug("Engagement fetch failed for %s: %s", post["fb_post_id"], exc)
            continue
        memory.update_post_engagement(
            post["fb_post_id"], stats["likes"], stats["comments"], stats["shares"]
        )
        updated += 1
    return updated


def write_skill_md(memory, memory_dir, top_n: int = 5) -> Path | None:
    """Write memory/skill.md from the best-performing posts (or do nothing)."""
    top = [
        p for p in memory.top_posts_by_engagement(top_n)
        if (p["likes"] or p["comments"] or p["shares"])
    ]
    if not top:
        return None

    lines = [
        "# What works on this Page (auto-learned from engagement)",
        "",
        "These past posts earned the most engagement. Lean into the same hooks,",
        "topics, length, and tone — do MORE of what made them work (don't copy them).",
        "",
    ]
    for index, post in enumerate(top, 1):
        text = " ".join(post["content"].split())
        if len(text) > 220:
            text = text[:220].rstrip() + "…"
        lines.append(
            f"{index}. ({post['likes']} likes · {post['comments']} comments · {post['shares']} shares)"
        )
        lines.append(f"   {text}")
        lines.append("")

    path = Path(memory_dir) / "skill.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    return path


def learn(
    memory,
    fb,
    memory_dir,
    *,
    force: bool = False,
    limit: int = DEFAULT_AUTO_LIMIT,
    min_interval_minutes: int = DEFAULT_AUTO_MIN_INTERVAL_MINUTES,
) -> bool:
    """Sync engagement then refresh skill.md. Never raises (safe in the loop)."""
    try:
        if not force and not should_sync(memory, min_interval_minutes):
            write_skill_md(memory, memory_dir)
            log.debug("Engagement learning skipped; last refresh is still fresh.")
            return True

        updated = sync(memory, fb, limit=limit)
        path = write_skill_md(memory, memory_dir)
        if path:
            log.info("Learned from %d post(s) → refreshed %s", updated, path.name)
        return True
    except Exception as exc:  # noqa: BLE001 - must not break the posting loop
        log.warning("Engagement learning skipped this cycle: %s", exc)
        return False


def learn_background(memory, fb, memory_dir, **kwargs) -> None:
    """Run engagement learning without holding up post generation or the dashboard."""
    thread = threading.Thread(
        target=lambda: learn(memory, fb, memory_dir, **kwargs),
        daemon=True,
    )
    thread.start()
