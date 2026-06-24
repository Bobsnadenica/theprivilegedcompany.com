#!/usr/bin/env python3
"""Regenerate images.json from the explicitly documented images in how_to.txt.

The AIPost247 guide's "Снимки, за по-лесно" gallery reads images.json (a static
site can't list a directory). Run this after adding/removing screenshots:

    python3 build-images-manifest.py

Descriptions are read from how_to.txt lines in this format:

    filename.jpg - Text shown on the image

Only files listed in how_to.txt are published. This keeps drafts/placeholders
out of the website even when they remain in the local assets folder.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
HOW_TO = "how_to.txt"

def _key(name: str):
    stem = os.path.splitext(name)[0].lower()
    leading = re.match(r"^(\d+)(?:\D|$)", stem)
    if leading:
        return (0, int(leading.group(1)), stem)
    m = re.search(r"(\d+)", stem)
    return (1, int(m.group(1)) if m else 0, stem)


def _how_to_entries(existing_files: dict[str, str]) -> list[dict[str, str]]:
    path = os.path.join(HERE, HOW_TO)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError as exc:
        raise SystemExit(f"ABORT: cannot read {path}: {exc}") from exc

    missing: list[str] = []
    malformed: list[int] = []
    duplicates: list[str] = []
    entries: list[dict[str, str]] = []
    seen: set[str] = set()
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = re.split(r"\s+-\s+", line.strip(), maxsplit=1)
        if len(parts) != 2:
            malformed.append(lineno)
            continue
        name, caption = (part.strip() for part in parts)
        normalized = name.lower()
        actual = existing_files.get(normalized)
        if not actual:
            missing.append(name)
            continue
        if not caption:
            malformed.append(lineno)
            continue
        if normalized in seen:
            duplicates.append(name)
            continue
        seen.add(normalized)
        entries.append({"src": actual, "caption": caption})
    if malformed:
        raise SystemExit(
            "ABORT: invalid how_to.txt line(s), expected 'filename.jpg - description': "
            + ", ".join(str(item) for item in malformed)
        )
    if missing:
        raise SystemExit(
            "ABORT: how_to.txt references missing image file(s): "
            + ", ".join(sorted(set(missing), key=str.lower))
        )
    if duplicates:
        raise SystemExit(
            "ABORT: duplicate image(s) in how_to.txt: "
            + ", ".join(sorted(set(duplicates), key=str.lower))
        )
    if not entries:
        raise SystemExit("ABORT: how_to.txt does not publish any images.")
    return sorted(entries, key=lambda entry: _key(entry["src"]))


def main() -> None:
    files = sorted(
        (f for f in os.listdir(HERE) if os.path.splitext(f)[1].lower() in EXTS),
        key=_key,
    )
    existing = {f.lower(): f for f in files}
    manifest = _how_to_entries(existing)
    with open(os.path.join(HERE, "images.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    print(f"Wrote images.json with {len(manifest)} published image(s).")


if __name__ == "__main__":
    main()
