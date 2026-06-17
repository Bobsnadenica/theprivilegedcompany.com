#!/usr/bin/env python3
"""Validate assets/video/video.txt before packaging.

The guide reads YouTube links directly from video.txt. This check keeps the
site deploy-friendly when those links change: every non-empty, non-comment line
must contain a recognizable YouTube URL.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
VIDEO_TXT = HERE / "video.txt"
YOUTUBE_URL_RE = re.compile(r"https?://(?:[^\s]+\.)?(?:youtube\.com|youtu\.be)/[^\s<>\"']+", re.I)
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,}$")


def _video_id(url: str) -> str:
    parsed = urlparse(url.strip().rstrip("),.;"))
    host = (parsed.hostname or "").lower()
    for prefix in ("www.", "m."):
        if host.startswith(prefix):
            host = host[len(prefix):]

    if host == "youtu.be":
        return parsed.path.strip("/").split("/", 1)[0]

    if host == "youtube.com" or host.endswith(".youtube.com"):
        if parsed.path == "/watch":
            return (parse_qs(parsed.query).get("v") or [""])[0]
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] in {"embed", "shorts", "live"}:
            return parts[1]

    return ""


def main() -> int:
    if not VIDEO_TXT.is_file():
        print(f"ABORT: missing {VIDEO_TXT}", file=sys.stderr)
        return 1

    errors: list[str] = []
    count = 0
    for lineno, raw in enumerate(VIDEO_TXT.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        match = YOUTUBE_URL_RE.search(line)
        if not match:
            errors.append(f"line {lineno}: no YouTube URL found")
            continue
        video_id = _video_id(match.group(0))
        if not VIDEO_ID_RE.match(video_id):
            errors.append(f"line {lineno}: cannot read YouTube video id")
            continue
        count += 1

    if errors:
        print(f"ABORT: invalid YouTube link(s) in {VIDEO_TXT}", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 1

    print(f"Validated {count} video link(s) in {VIDEO_TXT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
