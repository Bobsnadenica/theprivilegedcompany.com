#!/usr/bin/env python3
"""Regenerate images.json from every image in this folder.

The AIPost247 guide's "Снимки, за по-лесно" gallery reads images.json (a static
site can't list a directory). Run this after adding/removing screenshots:

    python3 build-images-manifest.py

Descriptions are read from how_to.txt lines in this format:

    filename.jpg - Text shown on the image

Optionally override a file by adding it to CAPTIONS below.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
HOW_TO = "how_to.txt"

# Optional: { "filename.jpg": "Caption shown under the image" }
CAPTIONS: dict[str, str] = {}


def _key(name: str):
    m = re.search(r"(\d+)", name)
    return (0 if name.lower() == "soon.jpg" else 1, int(m.group(1)) if m else 0, name.lower())


def _how_to_captions() -> dict[str, str]:
    path = os.path.join(HERE, HOW_TO)
    captions: dict[str, str] = {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return captions

    for line in lines:
        parts = re.split(r"\s+-\s+", line.strip(), maxsplit=1)
        if len(parts) != 2:
            continue
        name, caption = (part.strip() for part in parts)
        if name and caption:
            captions[name.lower()] = caption
    return captions


def main() -> None:
    files = sorted(
        (f for f in os.listdir(HERE) if os.path.splitext(f)[1].lower() in EXTS),
        key=_key,
    )
    how_to = _how_to_captions()
    manifest = []
    for f in files:
        entry = {"src": f}
        caption = CAPTIONS.get(f) or how_to.get(f.lower())
        if caption:
            entry["caption"] = caption
        manifest.append(entry)
    with open(os.path.join(HERE, "images.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    print(f"Wrote images.json with {len(files)} image(s).")


if __name__ == "__main__":
    main()
