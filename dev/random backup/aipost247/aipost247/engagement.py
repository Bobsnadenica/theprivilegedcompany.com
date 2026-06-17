"""Self-improvement loop.

Reads engagement (likes / comments / shares) for past posts via the Graph API,
stores it, and writes ``memory/skill.md`` describing what performed best. That
file is fed back into the prompt (see MemoryStore.build_context), so the AI
writes better posts over time based on what actually worked.
"""
from __future__ import annotations

from pathlib import Path

from .facebook_client import FacebookError
from .logging_setup import get_logger

log = get_logger("engagement")


def sync(memory, fb, limit: int = 25) -> int:
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


def learn(memory, fb, memory_dir) -> bool:
    """Sync engagement then refresh skill.md. Never raises (safe in the loop)."""
    try:
        updated = sync(memory, fb)
        path = write_skill_md(memory, memory_dir)
        if path:
            log.info("Learned from %d post(s) → refreshed %s", updated, path.name)
        return True
    except Exception as exc:  # noqa: BLE001 - must not break the posting loop
        log.warning("Engagement learning skipped this cycle: %s", exc)
        return False
