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
import sys
from pathlib import Path

from .logging_setup import get_logger
from .provider_runtime import (
    ProviderProcessCancelled,
    ProviderProcessError,
    ProviderProcessTimeout,
    provider_workspace,
    run_streaming,
)

log = get_logger("gemini")

GEMINI_BIN = "gemini"
NPM_PACKAGE = "@google/gemini-cli"
DEFAULT_MODEL = "gemini-2.5-flash"

# Substrings that mean the model is temporarily overloaded / rate limited.
_CAPACITY_HINTS = (
    "429", "resource_exhausted", "rate limit", "ratelimit", "rate_limit",
    "ratelimitexceeded", "too many requests", "capacity", "quota",
    "model_capacity_exhausted", "overloaded", "unavailable", "exhausted",
)

# Models tried (in order) if the chosen one is temporarily at capacity.
FALLBACK_MODELS = ["gemini-2.5-pro"]


class GeminiError(Exception):
    """Generic Gemini CLI failure."""


class GeminiNotInstalled(GeminiError):
    """The gemini CLI (or Node/npm) is not available."""


class GeminiAuthError(GeminiError):
    """The gemini CLI is installed but not logged in."""


class GeminiRateLimitError(GeminiError):
    """The model is temporarily at capacity / rate limited (transient)."""


class GeminiCancelledError(GeminiError):
    """The user cancelled an active provider process."""


def _has_cached_credentials() -> bool:
    """True if the Gemini CLI has cached Google OAuth credentials on disk."""
    base = Path.home() / ".gemini"
    for name in ("oauth_creds.json", "google_accounts.json"):
        path = base / name
        try:
            if path.is_file() and path.stat().st_size > 2:
                return True
        except OSError:
            pass
    return False


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
            "        Install Node.js 20+ from https://nodejs.org/ "
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


def _run_once(
    prompt: str,
    model: str,
    timeout: int,
    *,
    progress=None,
    cancel_event=None,
) -> str:
    """Run gemini once with a single model. Raises typed errors on failure."""
    path = cli_path()
    if not path:
        raise GeminiNotInstalled("The Gemini CLI is not installed. Run setup.")

    emit = progress or (lambda _message: None)
    assistant_parts: list[str] = []

    def on_stdout(line: str) -> None:
        try:
            event = json.loads(line)
        except ValueError:
            return
        event_type = event.get("type")
        if event_type == "init":
            emit(f"Gemini session started with {event.get('model') or model}.")
        elif event_type == "result":
            emit(f"Gemini finished with status {event.get('status') or 'complete'}.")
        if event_type == "message" and event.get("role") == "assistant":
            content = event.get("content")
            if isinstance(content, str) and content:
                if event.get("delta", True):
                    assistant_parts.append(content)
                else:
                    assistant_parts[:] = [content]

    cmd = [
        path,
        "-m",
        model,
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--approval-mode",
        "plan",
        "--skip-trust",
    ]
    emit("Started isolated Gemini process.")
    try:
        with provider_workspace() as workspace:
            proc = run_streaming(
                cmd,
                timeout=timeout,
                cwd=workspace,
                progress=emit,
                cancel_event=cancel_event,
                on_stdout=on_stdout,
            )
    except ProviderProcessTimeout as exc:
        raise GeminiError(f"Gemini CLI timed out after {timeout}s.") from exc
    except ProviderProcessCancelled as exc:
        raise GeminiCancelledError(str(exc)) from exc
    except ProviderProcessError as exc:
        raise GeminiError(f"Could not run the Gemini CLI: {exc}") from exc

    stdout = proc.stdout.strip()
    stderr = proc.stderr.strip()

    if proc.returncode != 0:
        haystack = f"{stderr}\n{stdout}".lower()
        # Capacity / rate limit is transient — check it FIRST. (Its stack trace
        # mentions 'OAuth2Client', which must NOT be read as an auth failure.)
        if any(hint in haystack for hint in _CAPACITY_HINTS):
            raise GeminiRateLimitError(
                "Gemini is temporarily at capacity / rate limited for this model."
            )
        # Decide 'logged in?' from the credentials file, not log/stack-trace text.
        if not _has_cached_credentials():
            raise GeminiAuthError(
                "The Gemini CLI is not logged in. Run 'login-gemini' and choose "
                "'Login with Google'."
            )
        raise GeminiError(f"Gemini CLI error (exit {proc.returncode}): {stderr or stdout or 'no output'}")

    text = _clean("".join(assistant_parts) if assistant_parts else stdout)
    if not text:
        raise GeminiError("Gemini CLI returned an empty response.")
    return text


def generate(
    prompt: str,
    model: str = DEFAULT_MODEL,
    timeout: int = 180,
    *,
    progress=None,
    cancel_event=None,
) -> str:
    """Generate text; if the chosen model is at capacity, fall back to another."""
    models = [model] + [m for m in FALLBACK_MODELS if m != model]
    last: Exception | None = None
    for index, current in enumerate(models):
        try:
            return _run_once(
                prompt,
                current,
                timeout,
                progress=progress,
                cancel_event=cancel_event,
            )
        except GeminiRateLimitError as exc:
            last = exc
            if index + 1 < len(models):
                log.warning("Gemini model '%s' is busy; trying '%s' ...", current, models[index + 1])
    raise GeminiRateLimitError(
        f"All Gemini models are temporarily at capacity. Try again shortly. ({last})"
    )


def is_authenticated(model: str = DEFAULT_MODEL, timeout: int = 90) -> bool:
    """True if the Gemini CLI has cached Google credentials.

    Checks the credentials file rather than running a generation, so a busy model
    (capacity / rate limit) is never mistaken for 'not logged in'.
    """
    return _has_cached_credentials()


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

    if _has_cached_credentials():
        print("  Gemini вече е влязъл.")
        return True

    _select_oauth_auth_type()

    # Retry a few times when run interactively — the browser OAuth can be closed
    # too early, time out, or hit a transient hiccup. Non-interactive (e.g. a
    # background run) gets a single attempt and a clear failure.
    interactive = sys.stdin.isatty() and sys.stdout.isatty()
    max_attempts = 3 if interactive else 1
    for attempt in range(1, max_attempts + 1):
        print(
            "  Влизане в Google за Gemini ...\n"
            "  Ще се отвори браузър — завършете входа там. (Ако горе видите грешка за\n"
            "  зает модел / '429 capacity' — тя е временна и НЕ влияе на входа.)"
        )
        try:
            # One-shot request: on first use this triggers the Google OAuth
            # browser flow and then exits. Terminal is inherited so prompts show.
            subprocess.run([path, "-m", model, "-p", "Reply with: OK"], timeout=300)
        except subprocess.TimeoutExpired:
            print("  Времето за вход изтече.")
        except OSError as exc:
            log.warning("Could not start the Gemini login: %s", exc)

        if _has_cached_credentials():
            print("  ✓ Влязохте в Google за Gemini.")
            return True

        if attempt < max_attempts:
            answer = input("  Входът не успя. Да опитаме пак? (Y/n): ").strip().lower()
            if answer in {"n", "no", "не"}:
                break

    print(
        "  Входът в Gemini не може да се потвърди.\n"
        "  Завършете го ръчно: стартирайте `gemini` веднъж, изберете\n"
        "  'Login with Google', завършете входа в браузъра, после /quit.\n"
        "  После проверете пак с командата 'login-gemini'."
    )
    return False
