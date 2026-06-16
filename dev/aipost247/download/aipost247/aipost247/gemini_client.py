"""Content generation via the Gemini CLI — "Login with Google", no API key.

We shell out to Google's ``gemini`` CLI (npm: @google/gemini-cli). The user
authenticates once with their Google account (browser OAuth); after that the CLI
caches the credentials and we can generate posts non-interactively.

This avoids asking the user for any API key.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .logging_setup import get_logger

log = get_logger("gemini")

GEMINI_BIN = "gemini"
NPM_PACKAGE = "@google/gemini-cli"
DEFAULT_MODEL = "gemini-2.5-flash"

# Substrings that, in CLI output, usually mean "you need to log in".
_AUTH_HINTS = ("auth", "login", "oauth", "sign in", "credential", "unauthor", "permission denied")


class GeminiError(Exception):
    """Generic Gemini CLI failure."""


class GeminiNotInstalled(GeminiError):
    """The gemini CLI (or Node/npm) is not available."""


class GeminiAuthError(GeminiError):
    """The gemini CLI is installed but not logged in."""


def cli_path() -> str | None:
    return shutil.which(GEMINI_BIN)


def ensure_installed(auto_install: bool = True) -> str:
    """Return the path to ``gemini``, installing it via npm if necessary."""
    path = cli_path()
    if path:
        return path
    if not auto_install:
        raise GeminiNotInstalled("The Gemini CLI is not installed.")

    npm = shutil.which("npm")
    if not npm:
        raise GeminiNotInstalled(
            "Node.js / npm is required for the Gemini CLI but was not found.\n"
            "        Install Node.js 18+ from https://nodejs.org/ "
            "(macOS: `brew install node`), then run setup again."
        )

    log.info("Installing the Gemini CLI globally:  npm install -g %s", NPM_PACKAGE)
    try:
        subprocess.run([npm, "install", "-g", NPM_PACKAGE], check=True)
    except subprocess.CalledProcessError as exc:
        raise GeminiNotInstalled(
            f"Failed to install {NPM_PACKAGE} (exit {exc.returncode}).\n"
            f"        Try manually:  npm install -g {NPM_PACKAGE}\n"
            "        (You may need to fix npm global permissions or use a Node version manager.)"
        ) from exc

    path = cli_path()
    if not path:
        raise GeminiNotInstalled(
            "Installed the Gemini CLI, but 'gemini' is not on PATH.\n"
            "        Add your npm global bin directory (see `npm bin -g`) to PATH "
            "and reopen the terminal."
        )
    log.info("Gemini CLI installed at %s", path)
    return path


def _clean(text: str) -> str:
    text = (text or "").strip()
    # Drop the occasional informational first line printed to stdout.
    lines = text.splitlines()
    while lines and lines[0].strip().lower() in {
        "loaded cached credentials.",
        "loaded cached credentials",
    }:
        lines.pop(0)
    text = "\n".join(lines).strip()
    # Strip a single pair of wrapping quotes some models add.
    if len(text) >= 2 and text[0] in "\"'" and text[-1] == text[0]:
        text = text[1:-1].strip()
    return text


def generate(prompt: str, model: str = DEFAULT_MODEL, timeout: int = 180) -> str:
    """Run ``gemini -m <model> -p <prompt>`` and return the cleaned response."""
    path = cli_path()
    if not path:
        raise GeminiNotInstalled("The Gemini CLI is not installed. Run `python run.py setup`.")

    cmd = [path, "-m", model, "-p", prompt]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise GeminiError(f"Gemini CLI timed out after {timeout}s.") from exc
    except OSError as exc:
        raise GeminiError(f"Could not run the Gemini CLI: {exc}") from exc

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    if proc.returncode != 0:
        haystack = f"{stderr}\n{stdout}".lower()
        if any(hint in haystack for hint in _AUTH_HINTS):
            raise GeminiAuthError(
                "The Gemini CLI is not logged in. Run `python run.py login-gemini` "
                "and choose 'Login with Google'."
            )
        raise GeminiError(f"Gemini CLI error (exit {proc.returncode}): {stderr or stdout or 'no output'}")

    text = _clean(stdout)
    if not text:
        raise GeminiError("Gemini CLI returned an empty response.")
    return text


def is_authenticated(model: str = DEFAULT_MODEL, timeout: int = 90) -> bool:
    """Best-effort check that login works (does a tiny generation)."""
    try:
        generate("Reply with exactly: PONG", model=model, timeout=timeout)
        return True
    except GeminiError:
        return False


def _select_oauth_auth_type() -> None:
    """Tell the Gemini CLI to use 'Login with Google' so a one-shot command can
    trigger the browser OAuth directly, without the interactive auth picker."""
    settings = Path.home() / ".gemini" / "settings.json"
    try:
        settings.parent.mkdir(parents=True, exist_ok=True)
        data = {}
        if settings.exists():
            try:
                data = json.loads(settings.read_text(encoding="utf-8")) or {}
            except (ValueError, OSError):
                data = {}
        if data.get("selectedAuthType") != "oauth-personal":
            data["selectedAuthType"] = "oauth-personal"
            settings.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError as exc:  # non-fatal
        log.debug("Could not pre-select Gemini auth type: %s", exc)


def login(model: str = DEFAULT_MODEL) -> bool:
    """Authenticate the Gemini CLI with Google. Returns True if logged in.

    This only runs the Google login (browser OAuth) — it does NOT open the
    interactive Gemini chat. If already logged in, it does nothing.
    """
    path = ensure_installed()

    if is_authenticated(model, timeout=30):
        print("  Gemini вече е влязъл.")
        return True

    _select_oauth_auth_type()
    print(
        "  Влизане в Google за Gemini ...\n"
        "  Ще се отвори браузър — завършете входа там. Това ще продължи\n"
        "  автоматично (Gemini чатът НЯМА да се отвори)."
    )
    try:
        # One-shot request: on first use this triggers the Google OAuth browser
        # flow and then exits. Terminal is inherited so any prompts are visible.
        subprocess.run([path, "-m", model, "-p", "Reply with: OK"], timeout=300)
    except subprocess.TimeoutExpired:
        print("  Времето за вход изтече.")
    except OSError as exc:
        log.warning("Could not start the Gemini login: %s", exc)

    if is_authenticated(model, timeout=60):
        return True

    print(
        "  Входът в Gemini не може да се потвърди автоматично.\n"
        "  Завършете го ръчно: стартирайте `gemini` веднъж, изберете\n"
        "  'Login with Google', завършете входа в браузъра, после /quit.\n"
        "  После проверете пак с командата 'login-gemini'."
    )
    return False
