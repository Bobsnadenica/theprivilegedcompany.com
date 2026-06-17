"""Pluggable login-only AI CLIs — free generation, sign in with an account.

Beyond the Gemini CLI (which Google is retiring in favour of Antigravity), this
adds more "just log in, no API key" options:

  * ``antigravity`` — Google's Gemini CLI successor (``agy``). Sign in with Google.
  * ``codex``       — OpenAI Codex CLI (``codex``). "Sign in with ChatGPT" (works
                      on the free ChatGPT tier). No API key.

Gemini itself stays in :mod:`gemini_client`; this module handles the newer CLIs
and exposes a small dispatch (``is_logged_in`` / ``login_provider`` /
``ensure_provider``) that also delegates Gemini, so the rest of the app has one
place to ask "is the configured AI ready / log it in".

All three reuse the typed errors from :mod:`gemini_client` so ``app.safe_cycle``
keeps catching them unchanged.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from .gemini_client import (
    GeminiAuthError,
    GeminiError,
    GeminiNotInstalled,
    GeminiRateLimitError,
    _CAPACITY_HINTS,
    _clean,
)
from .logging_setup import get_logger

log = get_logger("cli_provider")

# Each provider is described by a small spec so adding/adjusting one is a
# one-line change once its exact CLI contract is confirmed on a real machine.
#   bin       : executable name on PATH
#   npm       : npm package to auto-install (None = show install_hint instead)
#   install   : human instructions when the binary is missing and not npm-installable
#   gen_args  : (prompt) -> argv for a single non-interactive completion
#   login_args: argv that triggers the browser sign-in (None = a gen call does it)
#   creds     : files that exist once logged in (best-effort; [] = probe instead)
PROVIDERS: dict[str, dict] = {
    "antigravity": {
        "label": "Antigravity (Google) — вход с Google, без ключ",
        "bin": "agy",
        "npm": None,
        # Auto-installer (official one-liners). Tried by ensure_installed().
        "install_cmd": {
            "posix": ["/bin/bash", "-lc",
                      "curl -fsSL https://antigravity.google/cli/install.sh | bash"],
            "nt": ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                   "irm https://antigravity.google/cli/install.ps1 | iex"],
        },
        # Where the installer commonly drops `agy` (PATH may not refresh in-process).
        "bin_dirs": ["~/.antigravity/bin", "~/.local/bin", "/usr/local/bin", "~/bin"],
        "install": (
            "Antigravity CLI не може да се инсталира автоматично. Инсталирайте го ръчно:\n"
            "        macOS/Linux:  curl -fsSL https://antigravity.google/cli/install.sh | bash\n"
            "        Windows:      irm https://antigravity.google/cli/install.ps1 | iex\n"
            "        (или изтеглете от https://antigravity.google/download), после опитайте пак."
        ),
        "gen_args": lambda prompt: ["-p", prompt],
        "login_args": None,  # first `agy -p ...` opens the Google sign-in
        "creds": ["~/.antigravity/oauth_creds.json", "~/.config/antigravity/oauth_creds.json"],
    },
    "codex": {
        "label": "ChatGPT (Codex) — вход с ChatGPT, без ключ (вкл. безплатен план)",
        "bin": "codex",
        "npm": "@openai/codex",
        "install": "Инсталирайте Codex CLI:  npm install -g @openai/codex",
        "gen_args": lambda prompt: ["exec", prompt],
        "login_args": ["login"],  # `codex login` -> Sign in with ChatGPT
        "creds": ["~/.codex/auth.json"],
    },
}


def is_cli_provider(provider: str) -> bool:
    return provider in PROVIDERS


def _spec(provider: str) -> dict:
    spec = PROVIDERS.get(provider)
    if not spec:
        raise GeminiError(f"Unknown AI provider: {provider!r}")
    return spec


def cli_path(provider: str) -> str | None:
    """Find the binary on PATH, or in the provider's known install dirs."""
    spec = _spec(provider)
    path = shutil.which(spec["bin"])
    if path:
        return path
    for d in spec.get("bin_dirs", []):
        cand = Path(os.path.expanduser(d)) / spec["bin"]
        try:
            if cand.is_file() and os.access(cand, os.X_OK):
                return str(cand)
        except OSError:
            pass
    return None


def ensure_installed(provider: str, auto_install: bool = True) -> str:
    """Return the path to the provider's CLI, installing it on demand."""
    spec = _spec(provider)
    path = cli_path(provider)
    if path:
        return path
    if not auto_install:
        raise GeminiNotInstalled(spec["install"])

    # 1) npm-based providers (e.g. Codex).
    npm_pkg = spec.get("npm")
    if npm_pkg:
        npm = shutil.which("npm")
        if not npm:
            raise GeminiNotInstalled(
                f"Node.js / npm е нужен за {spec['bin']}. Инсталирайте Node.js "
                f"(nodejs.org), после: npm install -g {npm_pkg}"
            )
        print(f"  Инсталиране на {spec['bin']} (npm install -g {npm_pkg}) — еднократно ...")
        try:
            subprocess.run([npm, "install", "-g", npm_pkg], check=True)
        except (subprocess.CalledProcessError, OSError) as exc:
            raise GeminiNotInstalled(
                f"Неуспешна инсталация на {npm_pkg}: {exc}. Опитайте ръчно: "
                f"npm install -g {npm_pkg}"
            ) from exc

    # 2) script-based providers (e.g. Antigravity's curl/PowerShell installer).
    else:
        installer = spec.get("install_cmd") or {}
        cmd = installer.get(os.name) or installer.get("posix")
        if not cmd:
            raise GeminiNotInstalled(spec["install"])
        print(f"  Инсталиране на {spec['bin']} — еднократно, може да отнеме минута ...")
        try:
            subprocess.run(cmd, check=True)
        except (subprocess.CalledProcessError, OSError) as exc:
            raise GeminiNotInstalled(spec["install"] + f"\n        (авто-инсталацията не успя: {exc})") from exc

    path = cli_path(provider)
    if path:
        log.info("%s installed at %s", spec["bin"], path)
        return path
    raise GeminiNotInstalled(
        f"{spec['bin']} е инсталиран, но не е на PATH. Отворете нов терминал "
        f"и опитайте пак.\n{spec['install']}"
    )


def is_authenticated(provider: str) -> bool:
    """True if the CLI has cached login credentials on disk (best-effort)."""
    for cand in _spec(provider).get("creds", []):
        path = Path(os.path.expanduser(cand))
        try:
            if path.is_file() and path.stat().st_size > 2:
                return True
        except OSError:
            pass
    return False


def login(provider: str, timeout: int = 300) -> bool:
    spec = _spec(provider)
    path = ensure_installed(provider)
    if is_authenticated(provider):
        print(f"  Вече сте влезли ({spec['bin']}).")
        return True
    args = spec.get("login_args")
    cmd = [path] + (args if args else spec["gen_args"]("Reply with: OK"))
    print(
        f"  Влизане през {spec['bin']} ...\n"
        "  Ще се отвори браузър — завършете входа там (без API ключ)."
    )
    try:
        subprocess.run(cmd, timeout=timeout)
    except subprocess.TimeoutExpired:
        print("  Времето за вход изтече.")
    except OSError as exc:
        log.warning("Could not start %s login: %s", spec["bin"], exc)
    if is_authenticated(provider):
        print("  ✓ Влязохте успешно.")
        return True
    print(
        f"  Входът не може да се потвърди автоматично. Стартирайте `{spec['bin']}` "
        "веднъж ръчно, завършете входа в браузъра, после проверете пак."
    )
    return False


def generate(provider: str, prompt: str, timeout: int = 180) -> str:
    """One-shot text completion via the provider's CLI. Raises typed errors."""
    spec = _spec(provider)
    path = cli_path(provider)
    if not path:
        raise GeminiNotInstalled(spec["install"])
    cmd = [path] + spec["gen_args"](prompt)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise GeminiError(f"{spec['bin']} timed out after {timeout}s.") from exc
    except OSError as exc:
        raise GeminiError(f"Could not run {spec['bin']}: {exc}") from exc

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0:
        haystack = f"{stderr}\n{stdout}".lower()
        if any(hint in haystack for hint in _CAPACITY_HINTS):
            raise GeminiRateLimitError(f"{spec['bin']} is temporarily at capacity / rate limited.")
        if not is_authenticated(provider):
            raise GeminiAuthError(
                f"{spec['bin']} не е влязъл. Изпълнете вход за този доставчик."
            )
        raise GeminiError(f"{spec['bin']} error (exit {proc.returncode}): {stderr or stdout or 'no output'}")

    text = _clean(stdout)
    if not text:
        raise GeminiError(f"{spec['bin']} returned an empty response.")
    return text


# --- unified dispatch (also covers Gemini, so callers have one entry) -------
def ensure_provider(config) -> str:
    if config.ai_provider == "gemini":
        from . import gemini_client

        return gemini_client.ensure_installed()
    return ensure_installed(config.ai_provider)


def is_logged_in(config) -> bool:
    if config.ai_provider == "gemini":
        from . import gemini_client

        return gemini_client.is_authenticated(config.gemini_model)
    if is_cli_provider(config.ai_provider):
        return is_authenticated(config.ai_provider)
    return True  # openai (key-based) is handled elsewhere


def login_provider(config) -> bool:
    if config.ai_provider == "gemini":
        from . import gemini_client

        return gemini_client.login(config.gemini_model)
    if is_cli_provider(config.ai_provider):
        return login(config.ai_provider)
    return True
