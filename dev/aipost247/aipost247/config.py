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


# --- interactive setup wizard -------------------------------------------
def run_setup_wizard(existing: Config) -> None:
    """Interactive, idempotent configuration wizard. Writes .env + seeds memory."""
    from . import gemini_client
    from .facebook_client import FacebookClient, FacebookError
    from .fb_oauth import login_and_select_page

    ensure_dirs()
    print("\n" + "=" * 68)
    print(" AIPost247 — setup wizard")
    print("=" * 68)

    values: dict[str, str] = {}

    # 1) AI provider ------------------------------------------------------
    print("\n--- 1/4  AI content generator -------------------------------------")
    choice = input(
        "How should posts be written?\n"
        "  [1] Gemini — log in with your Google account (no API key)  (recommended)\n"
        "  [2] OpenAI — paste an API key\n"
        "Choose 1 or 2 [1]: "
    ).strip() or "1"

    if choice == "2":
        values["AI_PROVIDER"] = "openai"
        print("Get a key at https://platform.openai.com/api-keys")
        values["OPENAI_API_KEY"] = _prompt_secret("OpenAI API key", existing.openai_api_key)
        values["OPENAI_MODEL"] = (
            input(f"OpenAI model [{existing.openai_model or DEFAULT_OPENAI_MODEL}]: ").strip()
            or existing.openai_model or DEFAULT_OPENAI_MODEL
        )
        _pip_install("openai")  # only needed for this provider
    else:
        values["AI_PROVIDER"] = "gemini"
        gemini_model = (
            input(f"Gemini model [{existing.gemini_model or DEFAULT_GEMINI_MODEL}]: ").strip()
            or existing.gemini_model or DEFAULT_GEMINI_MODEL
        )
        values["GEMINI_MODEL"] = gemini_model
        try:
            print("Making sure the Gemini CLI is installed ...")
            gemini_client.ensure_installed()
            if input("Log in to Google for Gemini now? (Y/n): ").strip().lower() != "n":
                if gemini_client.login(gemini_model):
                    print("  OK — Gemini is ready.")
                # login() prints its own next-step guidance if it can't confirm.
        except gemini_client.GeminiError as exc:
            print(f"  WARNING: {exc}")
            print("  You can finish this later with:  python run.py login-gemini")

    # 2) Facebook ---------------------------------------------------------
    print("\n--- 2/4  Connect your Facebook Page -------------------------------")
    print(
        "Log in with Facebook and pick your Page — then it auto-posts on your\n"
        "schedule for as long as AIPost247 keeps running.\n"
        "(One-time: Facebook requires a free Meta app to post to a Page — same as\n"
        " Buffer/Hootsuite. The wizard walks you through creating it.)"
    )
    api_version = existing.graph_api_version or DEFAULT_GRAPH_VERSION
    values["GRAPH_API_VERSION"] = api_version

    fb_choice = input(
        "\n  [1] Connect with Facebook (guided)  (recommended)\n"
        "  [2] Paste a Page ID + token manually\n"
        "Choose 1 or 2 [1]: "
    ).strip() or "1"

    page_id = existing.fb_page_id
    page_token = existing.fb_page_access_token

    if fb_choice == "1":
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
                    print(f"  OK — connected Page: {page_name} (id {page_id})")
                    connected = True
                except FacebookError as exc:
                    print(f"\n  Facebook login didn't complete:\n  {exc}\n")
                    if input("  Try the login again? (Y/n): ").strip().lower() == "n":
                        break
            if not connected and input(
                "  Paste a Page token manually instead? (y/N): "
            ).strip().lower() == "y":
                page_id = input(f"Facebook Page ID [{existing.fb_page_id}]: ").strip() or existing.fb_page_id
                page_token = _prompt_secret("Page Access Token", existing.fb_page_access_token)
        else:
            print("  Skipped Facebook — you can finish later with `python run.py setup`.")
    else:
        page_id = input(f"Facebook Page ID [{existing.fb_page_id}]: ").strip() or existing.fb_page_id
        page_token = _prompt_secret("Long-lived Page Access Token", existing.fb_page_access_token)

    values["FB_PAGE_ID"] = page_id
    values["FB_PAGE_ACCESS_TOKEN"] = page_token

    # Validate the Page token (best effort).
    try:
        name = FacebookClient(page_id, page_token, api_version=api_version).validate()
        print(f"  Connected to Facebook Page: {name!r}")
    except FacebookError as exc:
        print(f"  WARNING: could not validate the Page token: {exc}")
        if input("  Save anyway? (y/N): ").strip().lower() != "y":
            print("Setup aborted — nothing saved.")
            return

    # 3) Schedule ---------------------------------------------------------
    print("\n--- 3/4  Posting schedule -----------------------------------------")
    sched = input(
        "  [1] Every N hours/minutes\n"
        "  [2] Daily at specific times\n"
        "Choose 1 or 2 [1]: "
    ).strip() or "1"
    if sched == "2":
        while True:
            raw = input("Times (24h, comma-separated, e.g. 09:00,18:00): ").strip()
            times = [t.strip() for t in raw.split(",") if t.strip()]
            if times and all(_valid_time(t) for t in times):
                break
            print("  Please use HH:MM 24-hour times, comma separated.")
        values["SCHEDULE_MODE"] = "daily"
        values["SCHEDULE_TIMES"] = ",".join(times)
    else:
        raw = input(
            "Post every how often? e.g. '6' = 6 hours, '90m' = 90 minutes [6]: "
        ).strip().lower() or "6"
        minutes = _as_int(raw[:-1], 360) if raw.endswith("m") else int(_as_float(raw, 6.0) * 60)
        values["SCHEDULE_MODE"] = "interval"
        values["SCHEDULE_INTERVAL_MINUTES"] = str(max(1, minutes))

    run_now = input("Publish one post immediately when the loop starts? (Y/n): ").strip().lower()
    values["RUN_ON_START"] = "false" if run_now == "n" else "true"
    dry = input("Dry-run mode — generate but DO NOT publish? (y/N): ").strip().lower()
    values["DRY_RUN"] = "true" if dry == "y" else "false"
    values["POST_LANGUAGE"] = (
        input(f"Language for posts [{existing.post_language}]: ").strip() or existing.post_language
    )

    # 4) Train your business ----------------------------------------------
    print("\n--- 4/4  Train your business (recommended) ------------------------")
    print("Add a short profile of your business so the AI writes relevant posts.")
    print("A form opens (with a text fallback) and is saved as a reusable skill.")
    if input("Open the business profile form now? (Y/n): ").strip().lower() != "n":
        from . import business

        business.run_training(MEMORY_DIR)

    _write_env(values)
    print("\n" + "=" * 68)
    print(" Configuration saved to .env (permissions 600).")
    print(" Try a preview first:")
    print("   python run.py generate    # write a post WITHOUT publishing")
    print(" Then go live:")
    print("   python run.py run         # auto-posts on your schedule")
    print()
    print(" It keeps posting for as long as it stays running. To run it in the")
    print(" background (survives closing the terminal):")
    if os.name == "nt":
        print('   start "AIPost247" run.bat run')
    else:
        print("   nohup ./run.sh run > aipost247.out 2>&1 &")
    print("=" * 68 + "\n")
