#!/usr/bin/env python3
"""AIPost247 launcher — the ONLY file you run directly.

    python run.py            # open the dashboard
    python run.py setup      # interactive configuration wizard
    python run.py post-now   # generate + publish one post immediately
    python run.py generate   # generate one post and print it (does NOT publish)
    python run.py status     # show configuration + recent posts
    python run.py add-knowledge "text" [--topic T]
    python run.py add-instruction "text"

This file deliberately uses ONLY the Python standard library, so it can run
*before* the third-party dependencies exist. Its first job is to make sure the
packages in requirements.txt are installed, then it hands off to the real
application package (``aipost247``).
"""
from __future__ import annotations

import importlib
import importlib.util
import os
import re
import subprocess
import sys

# import-name -> pip-name (used only for the "missing" message).
# 'openai' is intentionally NOT here — it's optional and installed on demand
# only if the user picks the OpenAI provider during setup.
REQUIRED_MODULES = {
    "requests": "requests",
    "dotenv": "python-dotenv",
    "schedule": "schedule",
}

HERE = os.path.dirname(os.path.abspath(__file__))
REQUIREMENTS = os.path.join(HERE, "requirements.txt")
MIN_PYTHON = (3, 9)


def _version() -> str:
    """Read the package version without importing third-party dependencies."""
    init_path = os.path.join(HERE, "aipost247", "__init__.py")
    try:
        with open(init_path, "r", encoding="utf-8") as fh:
            match = re.search(r'__version__\s*=\s*"([^"]+)"', fh.read())
            if match:
                return match.group(1)
    except OSError:
        pass
    return "unknown"


def _in_virtualenv() -> bool:
    return (
        getattr(sys, "real_prefix", None) is not None
        or sys.prefix != getattr(sys, "base_prefix", sys.prefix)
    )


def _missing_modules() -> list[str]:
    return [name for name in REQUIRED_MODULES if importlib.util.find_spec(name) is None]


def ensure_dependencies() -> None:
    """Check for required packages and auto-install them if any are missing."""
    if sys.version_info < MIN_PYTHON:
        sys.exit(
            f"AIPost247 requires Python {MIN_PYTHON[0]}.{MIN_PYTHON[1]}+, "
            f"but you are running {sys.version.split()[0]}."
        )

    missing = _missing_modules()
    if not missing:
        return

    print(f"[setup] Missing dependencies: {', '.join(missing)}")
    if not os.path.exists(REQUIREMENTS):
        sys.exit(f"[setup] Cannot auto-install: {REQUIREMENTS} not found.")

    if not _in_virtualenv() and os.environ.get("AIPOST247_ALLOW_SYSTEM_PIP", "").lower() not in {
        "1",
        "true",
        "yes",
    }:
        sys.exit(
            "[setup] Dependencies are missing, but this Python is not inside a virtual environment.\n"
            "        Run the one-command launcher instead:\n"
            "          ./run.sh            # macOS / Linux\n"
            "          run.bat             # Windows\n"
            "        Or create a venv manually:\n"
            "          python3 -m venv .venv && source .venv/bin/activate\n"
            "          python -m pip install -r requirements.txt\n"
            "          python run.py\n"
            "        To force the old system-pip behavior, set AIPOST247_ALLOW_SYSTEM_PIP=1."
        )

    print("[setup] Installing from requirements.txt (this runs only once) ...")
    try:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-r", REQUIREMENTS]
        )
    except subprocess.CalledProcessError as exc:
        sys.exit(
            f"[setup] Automatic install failed (exit code {exc.returncode}).\n"
            f"        Install manually:  {sys.executable} -m pip install -r requirements.txt"
        )

    importlib.invalidate_caches()
    still_missing = _missing_modules()
    if still_missing:
        sys.exit(
            "[setup] Still missing after install: "
            + ", ".join(still_missing)
            + "\n        Try a fresh virtual environment:\n"
            "          python3 -m venv .venv && source .venv/bin/activate\n"
            "          python run.py"
        )
    print("[setup] Dependencies ready.\n")


def main() -> None:
    if sys.argv[1:] == ["--version"]:
        print(f"AIPost247 {_version()}")
        return
    ensure_dependencies()
    # Imported only AFTER dependencies are guaranteed to be present.
    from aipost247.app import main as app_main

    raise SystemExit(app_main(sys.argv[1:]))


if __name__ == "__main__":
    main()
