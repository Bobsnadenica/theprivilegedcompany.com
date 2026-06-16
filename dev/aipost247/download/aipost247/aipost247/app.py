"""Application orchestration + command-line interface.

load config -> read memory -> generate (Gemini login or OpenAI) -> publish via
the Graph API -> record in memory -> repeat on a schedule.
"""
from __future__ import annotations

import argparse

from . import __version__, gemini_client
from .config import (
    DB_PATH,
    LOGS_DIR,
    MEMORY_DIR,
    Config,
    ensure_dirs,
    load_config,
    run_setup_wizard,
)
from .facebook_client import (
    FacebookAuthError,
    FacebookClient,
    FacebookError,
    FacebookRateLimitError,
)
from .gemini_client import GeminiAuthError, GeminiError, GeminiNotInstalled
from .logging_setup import get_logger, setup_logging
from .memory import MemoryStore
from .scheduler import describe_schedule, run_forever

log = get_logger("app")


def _mask(secret: str, keep: int = 4) -> str:
    if not secret:
        return "(not set)"
    if len(secret) <= keep * 2:
        return "*" * len(secret)
    return f"{secret[:keep]}…{secret[-keep:]}"


# --- content generation dispatch ----------------------------------------
def generate_text(config: Config, context: str) -> str:
    """Generate a post using the configured provider."""
    if config.ai_provider == "openai":
        from .openai_client import generate_post

        return generate_post(config, context)

    # Default: Gemini CLI (login with Google).
    instruction = (
        "Write ONE engaging, ready-to-publish Facebook post based on the brief "
        f"below. Write in {config.post_language}. Keep it under "
        f"{config.post_max_chars} characters. Use a natural, human tone with 1-3 "
        "relevant hashtags only when they fit. Do not use markdown or surrounding "
        "quotes — return ONLY the post text.\n\n=== BRIEF ===\n" + context
    )
    return gemini_client.generate(instruction, model=config.gemini_model)


# --- core cycle ----------------------------------------------------------
def run_cycle(config: Config, memory: MemoryStore, fb: FacebookClient, *, dry_run: bool) -> bool:
    # Self-improvement: refresh engagement + skill.md so context reflects what works.
    from . import engagement

    engagement.learn(memory, fb, MEMORY_DIR)

    log.info("Building context from local memory ...")
    context = memory.build_context()

    provider = "Gemini CLI" if config.ai_provider != "openai" else "OpenAI"
    log.info("Generating a post with %s ...", provider)
    text = generate_text(config, context)
    log.info("Draft post (%d chars):\n----------\n%s\n----------", len(text), text)

    if dry_run:
        memory.add_post(text, fb_post_id=None, status="dry_run", model=config.ai_provider)
        log.info("DRY RUN — not publishing to Facebook. (Saved to memory.)")
        return True

    log.info("Publishing to Facebook Page %s ...", config.fb_page_id)
    post_id = fb.post(text)
    memory.add_post(text, fb_post_id=post_id, status="published", model=config.ai_provider)
    log.info("Published successfully. Facebook post id: %s", post_id)
    return True


def safe_cycle(config: Config, memory: MemoryStore, fb: FacebookClient, *, dry_run: bool) -> bool:
    """run_cycle wrapped so the scheduler can never be killed by an exception."""
    try:
        return run_cycle(config, memory, fb, dry_run=dry_run)
    except GeminiAuthError as exc:
        log.error("Gemini not logged in: %s — run `python run.py login-gemini`.", exc)
    except GeminiNotInstalled as exc:
        log.error("Gemini CLI unavailable: %s", exc)
    except GeminiError as exc:
        log.error("Gemini generation failed: %s — will try again next cycle.", exc)
    except FacebookAuthError as exc:
        log.error("Facebook token invalid: %s — re-run `python run.py setup`.", exc)
    except FacebookRateLimitError as exc:
        log.warning("Facebook rate limit: %s — will try again next cycle.", exc)
    except FacebookError as exc:
        log.error("Facebook publishing failed: %s — will try again next cycle.", exc)
    except Exception:  # noqa: BLE001 - last line of defence for the loop
        log.exception("Unexpected error during cycle — continuing.")
    return False


# --- commands ------------------------------------------------------------
def cmd_status(config: Config, memory: MemoryStore) -> int:
    print("\nAIPost247 status")
    print("-" * 40)
    print(f"AI provider      : {config.ai_provider}")
    if config.ai_provider == "openai":
        print(f"OpenAI model     : {config.openai_model}")
        print(f"OpenAI key       : {_mask(config.openai_api_key)}")
    else:
        print(f"Gemini model     : {config.gemini_model}")
        print(f"Gemini CLI       : {'installed' if gemini_client.cli_path() else 'NOT installed'}")
    print(f"Facebook Page ID : {config.fb_page_id or '(not set)'}")
    print(f"Facebook token   : {_mask(config.fb_page_access_token)}")
    print(f"Schedule         : {describe_schedule(config)}")
    print(f"Run on start     : {config.run_on_start}")
    print(f"Dry run          : {config.dry_run}")
    print(f"Posts in memory  : {memory.count_posts()}")
    recent = memory.recent_posts(3)
    if recent:
        print("\nLast posts:")
        for row in recent:
            preview = row["content"].replace("\n", " ")
            preview = preview[:80] + ("…" if len(preview) > 80 else "")
            print(f"  [{row['status']}] {row['created_at']}  {preview}")
    print()
    return 0


def run_loop(config: Config, memory: MemoryStore, fb: FacebookClient) -> int:
    # Pre-flight checks so misconfiguration is obvious before the loop starts.
    if config.ai_provider != "openai":
        try:
            gemini_client.ensure_installed()
            if not gemini_client.is_authenticated(config.gemini_model):
                log.warning("Gemini may not be logged in. If posts fail, run `python run.py login-gemini`.")
        except GeminiError as exc:
            log.warning("Gemini check: %s", exc)

    try:
        name = fb.validate()
        log.info("Connected to Facebook Page: %s (id %s)", name, config.fb_page_id)
    except FacebookAuthError as exc:
        log.error("Facebook token invalid: %s. Run `python run.py setup`.", exc)
        return 1
    except FacebookError as exc:
        log.warning("Could not validate token now (%s); will retry while running.", exc)

    if config.dry_run:
        log.info("DRY RUN mode is ON — posts will be generated but NOT published.")

    return run_forever(config, lambda: safe_cycle(config, memory, fb, dry_run=config.dry_run))


# --- CLI -----------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aipost247",
        description="Autonomous Facebook auto-poster (Gemini/OpenAI + Graph API).",
    )
    parser.add_argument("--version", action="version", version=f"AIPost247 {__version__}")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("setup", help="Interactive configuration wizard.")
    sub.add_parser("run", help="Start the autonomous scheduler loop (default).")
    sub.add_parser("post-now", help="Generate and publish one post immediately.")
    sub.add_parser("generate", help="Generate one post and print it (does NOT publish).")
    sub.add_parser("status", help="Show configuration and recent posts.")
    sub.add_parser("login-gemini", help="Log in to Google for the Gemini CLI.")
    sub.add_parser("train", help="Open the 'train your business' form (saved as a skill).")
    sub.add_parser("learn", help="Read post engagement and refresh skill.md (what works).")

    add_k = sub.add_parser("add-knowledge", help="Add a knowledge snippet to memory.")
    add_k.add_argument("text", help="The knowledge text.")
    add_k.add_argument("--topic", default=None, help="Optional topic label.")

    add_i = sub.add_parser("add-instruction", help="Add a standing instruction to memory.")
    add_i.add_argument("text", help="The instruction text.")

    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    ensure_dirs()
    setup_logging(str(LOGS_DIR))

    command = args.command or "run"

    if command == "setup":
        run_setup_wizard(load_config())
        return 0

    if command == "login-gemini":
        try:
            return 0 if gemini_client.login(load_config().gemini_model) else 1
        except GeminiError as exc:
            log.error("%s", exc)
            return 1

    if command == "train":
        from . import business

        business.run_training(MEMORY_DIR)
        return 0

    config = load_config()

    if command in {"run", "post-now", "generate"} and not config.is_ready():
        log.warning("Not configured yet (missing: %s). Launching setup ...", ", ".join(config.missing()))
        run_setup_wizard(config)
        config = load_config()
        if not config.is_ready():
            log.error("Setup incomplete. Exiting.")
            return 1

    memory = MemoryStore(str(DB_PATH), str(MEMORY_DIR))
    try:
        if command == "add-knowledge":
            memory.add_knowledge(args.text, topic=args.topic)
            log.info("Knowledge added to memory.")
            return 0
        if command == "add-instruction":
            memory.add_instruction(args.text)
            log.info("Instruction added to memory.")
            return 0
        if command == "status":
            return cmd_status(config, memory)

        fb = FacebookClient(
            config.fb_page_id,
            config.fb_page_access_token,
            app_id=config.fb_app_id,
            app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )

        if command == "learn":
            from . import engagement

            updated = engagement.sync(memory, fb)
            path = engagement.write_skill_md(memory, MEMORY_DIR)
            log.info(
                "Read engagement for %d post(s); skill.md %s.",
                updated, "updated" if path else "not written yet (no engagement)",
            )
            return 0
        if command == "generate":
            return 0 if safe_cycle(config, memory, fb, dry_run=True) else 1
        if command == "post-now":
            return 0 if safe_cycle(config, memory, fb, dry_run=False) else 1
        if command == "run":
            return run_loop(config, memory, fb)

        log.error("Unknown command: %s", command)
        return 2
    finally:
        memory.close()
