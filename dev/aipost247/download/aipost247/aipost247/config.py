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
        value = getpass.getpass(f"{label} [Enter за да запазите текущата]: ").strip()
        return value or existing
    return getpass.getpass(f"{label}: ").strip()


def _prompt_meta_app(existing: Config) -> tuple[str, str]:
    """Връща (app_id, app_secret), като упътва създаването на Meta приложение."""
    from .fb_oauth import guided_meta_app_setup

    if existing.fb_app_id and existing.fb_app_secret:
        if input(f"  Да ползвам запазеното Meta приложение (App ID {existing.fb_app_id})? (Y/n): ").strip().lower() != "n":
            return existing.fb_app_id, existing.fb_app_secret

    if input("  Имате ли вече Meta приложение (App ID + Secret)? (y/N): ").strip().lower() != "y":
        guided_meta_app_setup()

    while True:
        app_id = input(f"  App ID [{existing.fb_app_id}]: ").strip() or existing.fb_app_id
        app_secret = _prompt_secret("  App Secret", existing.fb_app_secret)
        if app_id and app_secret:
            return app_id, app_secret
        nxt = input(
            "  Нужни са и App ID, и App Secret. "
            "Enter за да отворите упътването пак, или напишете 'skip': "
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
    print(f"  Стъпка {step} от {total}  ·  {title}")
    print(_rule("═"))


def _ask_yes_no(question: str, default: bool = True) -> bool:
    suffix = "Y/n" if default else "y/N"
    answer = input(f"{question} ({suffix}): ").strip().lower()
    return default if not answer else answer in {"y", "yes", "д", "да"}


def _choose(intro: str, options: list[tuple[str, str]], default: int = 1) -> int:
    """Печата номериран списък и връща избора (1-базиран)."""
    print(intro)
    for index, (label, desc) in enumerate(options, 1):
        mark = "   ← препоръчано" if index == default else ""
        print(f"    [{index}] {label}{mark}")
        if desc:
            print(f"         {desc}")
    while True:
        raw = input(f"  Вашият избор [1-{len(options)}, Enter = {default}]: ").strip()
        if not raw:
            return default
        if raw.isdigit() and 1 <= int(raw) <= len(options):
            return int(raw)
        print("  Напишете един от показаните номера.")


# --- interactive setup wizard -------------------------------------------
def run_setup_wizard(existing: Config) -> None:
    """Interactive, idempotent configuration wizard. Writes .env + seeds memory."""
    from . import gemini_client
    from .facebook_client import FacebookClient, FacebookError
    from .fb_oauth import login_and_select_page

    ensure_dirs()
    print("\n" + _rule("═"))
    print("  AIPost247  ·  Настройка")
    print(_rule("═"))
    print(
        "  Отнема около 3–5 минути. Ще настроим 4 неща:\n"
        "    1) AI, който пише публикациите\n"
        "    2) Вашата Facebook страница (вход и избор)\n"
        "    3) Колко често да публикува\n"
        "    4) Кратък профил на бизнеса ви\n"
        "  Може да стартирате това пак по всяко време с командата 'setup'.\n"
        "  Подробно ръководство с картинки: отворете index.html в тази папка."
    )

    values: dict[str, str] = {}

    # 1) AI provider ------------------------------------------------------
    _section(1, 4, "Изберете AI, който пише публикациите")
    choice = _choose(
        "  И двата варианта са безплатни за начало:",
        [
            ("Gemini — вход с Google (без API ключ)",
             "Нужен е инсталиран Node.js. Най-добре, ако вече го имате."),
            ("OpenAI — поставяте API ключ",
             "Работи без Node.js. Ключ от platform.openai.com/api-keys."),
        ],
        default=1,
    )

    if choice == 2:
        values["AI_PROVIDER"] = "openai"
        values["OPENAI_API_KEY"] = _prompt_secret("  OpenAI API ключ", existing.openai_api_key)
        values["OPENAI_MODEL"] = (
            input(f"  OpenAI модел [{existing.openai_model or DEFAULT_OPENAI_MODEL}]: ").strip()
            or existing.openai_model or DEFAULT_OPENAI_MODEL
        )
        print("  Инсталиране на OpenAI библиотеката ...")
        _pip_install("openai")
        print("  ✓ OpenAI е избран за писане на публикациите.")
    else:
        values["AI_PROVIDER"] = "gemini"
        gemini_model = (
            input(f"  Gemini модел [{existing.gemini_model or DEFAULT_GEMINI_MODEL}]: ").strip()
            or existing.gemini_model or DEFAULT_GEMINI_MODEL
        )
        values["GEMINI_MODEL"] = gemini_model
        try:
            print("  Проверка на Gemini CLI ...")
            gemini_client.ensure_installed()
            if _ask_yes_no("  Да влезете в Google за Gemini сега?", default=True):
                if gemini_client.login(gemini_model):
                    print("  ✓ Gemini е влязъл и готов.")
        except gemini_client.GeminiError as exc:
            print(f"  ! {exc}")
            print("    Съвет: инсталирайте Node.js (nodejs.org), или стартирайте setup пак и изберете OpenAI.")
            print("    Може и по-късно с командата 'login-gemini'.")

    # 2) Facebook ---------------------------------------------------------
    _section(2, 4, "Свържете вашата Facebook страница")
    print(
        "  Ще влезете с Facebook и ще изберете страницата си. Еднократно: Facebook\n"
        "  изисква безплатно Meta приложение, за да публикува на страница (както\n"
        "  autopost24 — но безплатно). Пълно ръководство с картинки: index.html."
    )
    api_version = existing.graph_api_version or DEFAULT_GRAPH_VERSION
    values["GRAPH_API_VERSION"] = api_version

    fb_choice = _choose(
        "  Как искате да се свържете?",
        [
            ("Свързване с Facebook (с упътване)",
             "Отваря браузъра — влизате и избирате страницата си."),
            ("Ръчно поставяне на Page ID + токен",
             "За напреднали, които вече ги имат."),
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
                    print(f"  ✓ Свързана страница: {page_name} (id {page_id})")
                    connected = True
                except FacebookError as exc:
                    print(f"\n  ! Facebook входът не завърши:\n    {exc}\n")
                    if not _ask_yes_no("  Да опитаме входа пак?", default=True):
                        break
            if not connected and _ask_yes_no(
                "  Да поставите Page токен ръчно вместо това?", default=False
            ):
                page_id = input(f"  Facebook Page ID [{existing.fb_page_id}]: ").strip() or existing.fb_page_id
                page_token = _prompt_secret("  Page Access Token", existing.fb_page_access_token)
        else:
            print("  Facebook е пропуснат — може да довършите по-късно с командата 'setup'.")
    else:
        page_id = input(f"  Facebook Page ID [{existing.fb_page_id}]: ").strip() or existing.fb_page_id
        page_token = _prompt_secret("  Дълготраен Page Access Token", existing.fb_page_access_token)

    values["FB_PAGE_ID"] = page_id
    values["FB_PAGE_ACCESS_TOKEN"] = page_token

    if page_token:
        try:
            name = FacebookClient(page_id, page_token, api_version=api_version).validate()
            print(f"  ✓ Потвърдена Facebook страница: {name!r}")
        except FacebookError as exc:
            print(f"  ! Токенът за страницата не може да се потвърди: {exc}")
            if not _ask_yes_no("  Да запазя въпреки това?", default=False):
                print("  Настройката е прекъсната — нищо не е запазено.")
                return

    # 3) Schedule ---------------------------------------------------------
    _section(3, 4, "Колко често да публикува")
    sched = _choose(
        "  Кога да публикува?",
        [
            ("На всеки няколко часа/минути", "напр. на всеки 2 часа."),
            ("Всеки ден в определени часове", "напр. 09:00 и 18:00."),
        ],
        default=1,
    )
    if sched == 2:
        while True:
            raw = input("  Часове (24ч, разделени със запетая, напр. 09:00,18:00): ").strip()
            times = [t.strip() for t in raw.split(",") if t.strip()]
            if times and all(_valid_time(t) for t in times):
                break
            print("    Използвайте часове във формат HH:MM, разделени със запетая.")
        values["SCHEDULE_MODE"] = "daily"
        values["SCHEDULE_TIMES"] = ",".join(times)
        print(f"  ✓ Ще публикува всеки ден в {', '.join(times)}.")
    else:
        raw = input("  На колко време да публикува?  напр. 2 = на 2 часа, 90m = 90 минути [2]: ").strip().lower() or "2"
        minutes = _as_int(raw[:-1], 120) if raw.endswith("m") else int(_as_float(raw, 2.0) * 60)
        minutes = max(1, minutes)
        values["SCHEDULE_MODE"] = "interval"
        values["SCHEDULE_INTERVAL_MINUTES"] = str(minutes)
        print(f"  ✓ Ще публикува на около {minutes} минути.")

    values["RUN_ON_START"] = (
        "true" if _ask_yes_no("  Да публикува веднага при стартиране?", default=True) else "false"
    )
    values["DRY_RUN"] = (
        "true" if _ask_yes_no("  Тестов режим (пише публикации, но НЕ ги публикува)?", default=False) else "false"
    )
    _cur_lang = (existing.post_language or "").strip().lower()
    _lang_default = 1 if _cur_lang.startswith(("бълг", "bulg")) else 2
    _lang_choice = _choose(
        "  На какъв език да пише публикациите?",
        [
            ("Български", "Публикациите ще са на български."),
            ("English", "Posts will be written in English."),
            ("Друг език", "Въведете език ръчно (напр. Deutsch, Español)."),
        ],
        default=_lang_default,
    )
    if _lang_choice == 1:
        values["POST_LANGUAGE"] = "Bulgarian"
    elif _lang_choice == 2:
        values["POST_LANGUAGE"] = "English"
    else:
        values["POST_LANGUAGE"] = (
            input("  Език (напишете го на английски, напр. German): ").strip()
            or existing.post_language
        )

    # 4) Train your business ----------------------------------------------
    _section(4, 4, "Разкажете на AI за бизнеса си")
    print(
        "  Кратък профил, за да звучат публикациите като вас — име, аудитория, тон, теми.\n"
        "  Отваря се малък прозорец за попълване; запазва се и се ползва за всяка публикация.\n"
        "  Може да го редактирате по всяко време с командата 'train'."
    )
    if _ask_yes_no("  Да отворя формата за бизнес профил сега?", default=True):
        from . import business

        business.run_training(MEMORY_DIR)

    _write_env(values)

    # Closing -------------------------------------------------------------
    runner = "run.bat" if os.name == "nt" else "./run.sh"
    print("\n" + _rule("═"))
    print("  ✓ Готово — настройките са запазени.")
    print(_rule("═"))
    print("  Какво да направите сега:")
    print(f"    1) Преглед на публикация (без публикуване):  {runner} generate")
    print(f"    2) Публикувай една сега:                     {runner} post-now")
    print(f"    3) Пусни на живо (авто-публикуване):         {runner} run")
    print()
    print("  Публикува, докато скриптът работи. За да работи на заден план")
    print("  (и след затваряне на терминала):")
    if os.name == "nt":
        print('    start "AIPost247" run.bat run')
    else:
        print("    nohup ./run.sh run > aipost247.out 2>&1 &")
    print(_rule("═") + "\n")
