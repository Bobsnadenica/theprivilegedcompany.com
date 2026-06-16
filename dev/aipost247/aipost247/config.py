"""Configuration: paths, the typed Config object, .env load/save, setup wizard.

No secret is ever hardcoded — everything is read from / written to a local
``.env`` file (gitignored, 600 permissions).
"""
from __future__ import annotations

import getpass
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv, set_key

from .logging_setup import get_logger

log = get_logger("config")

# --- paths ---------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent  # the aipost247/ project root
ENV_PATH = BASE_DIR / ".env"
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = BASE_DIR / "logs"
MEMORY_DIR = BASE_DIR / "memory"
KNOWLEDGE_DIR = MEMORY_DIR / "knowledge"
DB_PATH = DATA_DIR / "aipost247.db"

DEFAULT_GRAPH_VERSION = "v21.0"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"


def ensure_dirs() -> None:
    for directory in (DATA_DIR, LOGS_DIR, MEMORY_DIR, KNOWLEDGE_DIR):
        directory.mkdir(parents=True, exist_ok=True)


@dataclass
class Config:
    # AI provider: "gemini" (login with Google, no key) or "openai" (API key)
    ai_provider: str = "gemini"
    gemini_model: str = DEFAULT_GEMINI_MODEL
    openai_api_key: str = ""
    openai_model: str = DEFAULT_OPENAI_MODEL
    # Facebook
    fb_page_id: str = ""
    fb_page_access_token: str = ""
    fb_app_id: str = ""
    fb_app_secret: str = ""
    graph_api_version: str = DEFAULT_GRAPH_VERSION
    # scheduling
    schedule_mode: str = "interval"  # "interval" | "daily"
    schedule_interval_minutes: int = 240
    schedule_times: list[str] = field(default_factory=list)
    # behaviour
    run_on_start: bool = True
    dry_run: bool = False
    post_max_chars: int = 600
    post_language: str = "English"

    def ai_ready(self) -> bool:
        if self.ai_provider == "openai":
            return bool(self.openai_api_key)
        # Gemini auth lives in the CLI's own cache and is verified at runtime.
        return True

    def is_ready(self) -> bool:
        return self.ai_ready() and bool(self.fb_page_id and self.fb_page_access_token)

    def missing(self) -> list[str]:
        names = []
        if self.ai_provider == "openai" and not self.openai_api_key:
            names.append("OPENAI_API_KEY")
        if not self.fb_page_id:
            names.append("FB_PAGE_ID")
        if not self.fb_page_access_token:
            names.append("FB_PAGE_ACCESS_TOKEN")
        return names


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _as_int(value: str, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _as_float(value: str, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def load_config() -> Config:
    """Read the .env file (if present) into a Config object."""
    load_dotenv(ENV_PATH, override=True)
    get = os.getenv
    times = [t.strip() for t in (get("SCHEDULE_TIMES", "") or "").split(",") if t.strip()]
    return Config(
        ai_provider=(get("AI_PROVIDER", "gemini") or "gemini").lower(),
        gemini_model=get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL) or DEFAULT_GEMINI_MODEL,
        openai_api_key=get("OPENAI_API_KEY", "") or "",
        openai_model=get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL) or DEFAULT_OPENAI_MODEL,
        fb_page_id=get("FB_PAGE_ID", "") or "",
        fb_page_access_token=get("FB_PAGE_ACCESS_TOKEN", "") or "",
        fb_app_id=get("FB_APP_ID", "") or "",
        fb_app_secret=get("FB_APP_SECRET", "") or "",
        graph_api_version=get("GRAPH_API_VERSION", DEFAULT_GRAPH_VERSION) or DEFAULT_GRAPH_VERSION,
        schedule_mode=(get("SCHEDULE_MODE", "interval") or "interval").lower(),
        schedule_interval_minutes=_as_int(get("SCHEDULE_INTERVAL_MINUTES", "240"), 240),
        schedule_times=times,
        run_on_start=_as_bool(get("RUN_ON_START", "true"), True),
        dry_run=_as_bool(get("DRY_RUN", "false"), False),
        post_max_chars=_as_int(get("POST_MAX_CHARS", "600"), 600),
        post_language=get("POST_LANGUAGE", "English") or "English",
    )


def _write_env(values: dict[str, str]) -> None:
    """Persist key/value pairs to .env and lock the file down to 600."""
    ensure_dirs()
    ENV_PATH.touch(exist_ok=True)
    try:
        os.chmod(ENV_PATH, 0o600)
    except OSError:
        pass  # e.g. on Windows
    for key, value in values.items():
        set_key(str(ENV_PATH), key, value if value is not None else "")
    try:
        os.chmod(ENV_PATH, 0o600)
    except OSError:
        pass


def _pip_install(package: str) -> bool:
    """Install a single pip package into the current interpreter."""
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", package], check=True)
        return True
    except subprocess.CalledProcessError as exc:
        print(f"  Could not install {package} automatically ({exc}). "
              f"Install it with:  pip install {package}")
        return False


def _prompt_secret(label: str, existing: str) -> str:
    if existing:
        value = getpass.getpass(f"{label} [press Enter to keep existing]: ").strip()
        return value or existing
    return getpass.getpass(f"{label}: ").strip()


def _prompt_meta_app(existing: Config) -> tuple[str, str]:
    """Return (app_id, app_secret), guiding the user to create a Meta app if needed."""
    from .fb_oauth import guided_meta_app_setup

    if existing.fb_app_id and existing.fb_app_secret:
        if input(f"Use the saved Meta app (App ID {existing.fb_app_id})? (Y/n): ").strip().lower() != "n":
            return existing.fb_app_id, existing.fb_app_secret

    if input("Do you already have a Meta app (App ID + Secret)? (y/N): ").strip().lower() != "y":
        guided_meta_app_setup()

    while True:
        app_id = input(f"Meta App ID [{existing.fb_app_id}]: ").strip() or existing.fb_app_id
        app_secret = _prompt_secret("Meta App Secret", existing.fb_app_secret)
        if app_id and app_secret:
            return app_id, app_secret
        nxt = input(
            "  Both App ID and App Secret are required. "
            "Press Enter to re-open the guide, or type 'skip': "
        ).strip().lower()
        if nxt == "skip":
            return "", ""
        guided_meta_app_setup()


def _valid_time(value: str) -> bool:
    parts = value.split(":")
    if len(parts) != 2:
        return False
    try:
        hh, mm = int(parts[0]), int(parts[1])
    except ValueError:
        return False
    return 0 <= hh <= 23 and 0 <= mm <= 59


# --- small console helpers for a cleaner wizard -------------------------
def _rule(char: str = "─", width: int = 70) -> str:
    return char * width


def _section(step: int, total: int, title: str) -> None:
    print("\n" + _rule("═"))
    print(f"  Step {step} of {total}  ·  {title}")
    print(_rule("═"))


def _ask_yes_no(question: str, default: bool = True) -> bool:
    suffix = "Y/n" if default else "y/N"
    answer = input(f"{question} ({suffix}): ").strip().lower()
    return default if not answer else answer in {"y", "yes"}


def _choose(intro: str, options: list[tuple[str, str]], default: int = 1) -> int:
    """Print a numbered menu and return the chosen 1-based index."""
    print(intro)
    for index, (label, desc) in enumerate(options, 1):
        mark = "   ← recommended" if index == default else ""
        print(f"    [{index}] {label}{mark}")
        if desc:
            print(f"         {desc}")
    while True:
        raw = input(f"  Your choice [1-{len(options)}, Enter = {default}]: ").strip()
        if not raw:
            return default
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return int(raw)
        print("  Please type one of the numbers shown.")


# --- interactive setup wizard -------------------------------------------
def run_setup_wizard(existing: Config) -> None:
    """Interactive, idempotent configuration wizard. Writes .env + seeds memory."""
    from . import gemini_client
    from .facebook_client import FacebookClient, FacebookError
    from .fb_oauth import login_and_select_page

    ensure_dirs()
    print("\n" + _rule("═"))
    print("  AIPost247  ·  Setup")
    print(_rule("═"))
    print(
        "  Takes about 3–5 minutes. We'll set up 4 things:\n"
        "    1) The AI that writes your posts\n"
        "    2) Your Facebook Page (log in and pick it)\n"
        "    3) How often to post\n"
        "    4) A short profile of your business\n"
        "  You can re-run this anytime by choosing 'setup'."
    )

    values: dict[str, str] = {}

    # 1) AI provider ------------------------------------------------------
    _section(1, 4, "Choose the AI that writes your posts")
    choice = _choose(
        "  Both options are free to start:",
        [
            ("Gemini — sign in with Google (no API key)",
             "Needs Node.js installed. Best if you already have it."),
            ("OpenAI — paste an API key",
             "Works without Node.js. Key from platform.openai.com/api-keys."),
        ],
        default=1,
    )

    if choice == 2:
        values["AI_PROVIDER"] = "openai"
        values["OPENAI_API_KEY"] = _prompt_secret("  OpenAI API key", existing.openai_api_key)
        values["OPENAI_MODEL"] = (
            input(f"  OpenAI model [{existing.openai_model or DEFAULT_OPENAI_MODEL}]: ").strip()
            or existing.openai_model or DEFAULT_OPENAI_MODEL
        )
        print("  Installing the OpenAI library ...")
        _pip_install("openai")
        print("  ✓ OpenAI is set as your writer.")
    else:
        values["AI_PROVIDER"] = "gemini"
        gemini_model = (
            input(f"  Gemini model [{existing.gemini_model or DEFAULT_GEMINI_MODEL}]: ").strip()
            or existing.gemini_model or DEFAULT_GEMINI_MODEL
        )
        values["GEMINI_MODEL"] = gemini_model
        try:
            print("  Checking the Gemini CLI ...")
            gemini_client.ensure_installed()
            if _ask_yes_no("  Sign in to Google for Gemini now?", default=True):
                if gemini_client.login(gemini_model):
                    print("  ✓ Gemini is signed in and ready.")
        except gemini_client.GeminiError as exc:
            print(f"  ! {exc}")
            print("    Tip: install Node.js (nodejs.org), or re-run setup and pick OpenAI.")
            print("    You can also finish later by choosing 'login-gemini'.")

    # 2) Facebook ---------------------------------------------------------
    _section(2, 4, "Connect your Facebook Page")
    print(
        "  You'll log in with Facebook and pick your Page. One-time: Facebook\n"
        "  needs a free Meta app to post to a Page (same as Buffer / Hootsuite).\n"
        "  Need a picture guide? Open  index.html  in this folder."
    )
    api_version = existing.graph_api_version or DEFAULT_GRAPH_VERSION
    values["GRAPH_API_VERSION"] = api_version

    fb_choice = _choose(
        "  How would you like to connect?",
        [
            ("Connect with Facebook (guided)",
             "Opens your browser — log in, then choose your Page."),
            ("Paste a Page ID + token manually",
             "For advanced users who already have them."),
        ],
        default=1,
    )

    page_id = existing.fb_page_id
    page_token = existing.fb_page_access_token

    if fb_choice == 1:
        app_id, app_secret = _prompt_meta_app(existing)
        if app_id and app_secret:
            values["FB_APP_ID"] = app_id
            values["FB_APP_SECRET"] = app_secret
            connected = False
            while not connected:
                try:
                    page_id, page_token, page_name = login_and_select_page(
                        app_id, app_secret, api_version
                    )
                    print(f"  ✓ Connected Page: {page_name} (id {page_id})")
                    connected = True
                except FacebookError as exc:
                    print(f"\n  ! Facebook login didn't complete:\n    {exc}\n")
                    if not _ask_yes_no("  Try the login again?", default=True):
                        break
            if not connected and _ask_yes_no(
                "  Paste a Page token manually instead?", default=False
            ):
                page_id = input(f"  Facebook Page ID [{existing.fb_page_id}]: ").strip() or existing.fb_page_id
                page_token = _prompt_secret("  Page Access Token", existing.fb_page_access_token)
        else:
            print("  Skipped Facebook — you can finish later by running setup again.")
    else:
        page_id = input(f"  Facebook Page ID [{existing.fb_page_id}]: ").strip() or existing.fb_page_id
        page_token = _prompt_secret("  Long-lived Page Access Token", existing.fb_page_access_token)

    values["FB_PAGE_ID"] = page_id
    values["FB_PAGE_ACCESS_TOKEN"] = page_token

    if page_token:
        try:
            name = FacebookClient(page_id, page_token, api_version=api_version).validate()
            print(f"  ✓ Verified Facebook Page: {name!r}")
        except FacebookError as exc:
            print(f"  ! Could not verify the Page token: {exc}")
            if not _ask_yes_no("  Save anyway?", default=False):
                print("  Setup aborted — nothing saved.")
                return

    # 3) Schedule ---------------------------------------------------------
    _section(3, 4, "Choose how often to post")
    sched = _choose(
        "  When should it publish?",
        [
            ("Every few hours/minutes", "e.g. every 2 hours."),
            ("Daily at specific times", "e.g. 09:00 and 18:00."),
        ],
        default=1,
    )
    if sched == 2:
        while True:
            raw = input("  Times (24h, comma-separated, e.g. 09:00,18:00): ").strip()
            times = [t.strip() for t in raw.split(",") if t.strip()]
            if times and all(_valid_time(t) for t in times):
                break
            print("    Please use HH:MM 24-hour times, comma separated.")
        values["SCHEDULE_MODE"] = "daily"
        values["SCHEDULE_TIMES"] = ",".join(times)
        print(f"  ✓ Will post daily at {', '.join(times)}.")
    else:
        raw = input("  Post every how often?  e.g. 2 = every 2 hours, 90m = 90 minutes [2]: ").strip().lower() or "2"
        minutes = _as_int(raw[:-1], 120) if raw.endswith("m") else int(_as_float(raw, 2.0) * 60)
        minutes = max(1, minutes)
        values["SCHEDULE_MODE"] = "interval"
        values["SCHEDULE_INTERVAL_MINUTES"] = str(minutes)
        print(f"  ✓ Will post about every {minutes} minutes.")

    values["RUN_ON_START"] = (
        "true" if _ask_yes_no("  Publish one post right away when it starts?", default=True) else "false"
    )
    values["DRY_RUN"] = (
        "true" if _ask_yes_no("  Dry-run mode (write posts but DON'T publish them)?", default=False) else "false"
    )
    values["POST_LANGUAGE"] = (
        input(f"  Language for posts [{existing.post_language}]: ").strip() or existing.post_language
    )

    # 4) Train your business ----------------------------------------------
    _section(4, 4, "Tell the AI about your business")
    print(
        "  A short profile so posts sound like you — name, audience, tone, topics.\n"
        "  A small window opens to fill in; it's saved and reused for every post.\n"
        "  You can edit it anytime by choosing 'train'."
    )
    if _ask_yes_no("  Open the business profile form now?", default=True):
        from . import business

        business.run_training(MEMORY_DIR)

    _write_env(values)

    # Closing -------------------------------------------------------------
    runner = "run.bat" if os.name == "nt" else "./run.sh"
    print("\n" + _rule("═"))
    print("  ✓ Setup complete — your settings are saved.")
    print(_rule("═"))
    print("  What to do next:")
    print(f"    1) Preview a post (won't publish):   {runner} generate")
    print(f"    2) Publish one right now:            {runner} post-now")
    print(f"    3) Go live (auto-post on schedule):  {runner} run")
    print()
    print("  It keeps posting while it's running. To keep it running in the")
    print("  background:")
    if os.name == "nt":
        print('    start "AIPost247" run.bat run')
    else:
        print("    nohup ./run.sh run > aipost247.out 2>&1 &")
    print(_rule("═") + "\n")
