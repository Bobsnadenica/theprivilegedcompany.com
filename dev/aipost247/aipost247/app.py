"""Application orchestration + command-line interface.

load config -> read memory -> generate (Gemini login or OpenAI) -> publish via
the Graph API -> record in memory -> repeat on a schedule.
"""
from __future__ import annotations

import argparse
import sys

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
    FacebookAmbiguousWriteError,
    FacebookAuthError,
    FacebookClient,
    FacebookError,
    FacebookRateLimitError,
)
from .gemini_client import (
    GeminiAuthError,
    GeminiCancelledError,
    GeminiError,
    GeminiNotInstalled,
    GeminiRateLimitError,
)
from .logging_setup import get_logger, setup_logging
from .memory import MemoryStore
from .scheduler import describe_schedule, run_forever

log = get_logger("app")


class PendingPublicationError(RuntimeError):
    """An ambiguous Facebook write still needs human verification."""


def _mask(secret: str, keep: int = 4) -> str:
    if not secret:
        return "(not set)"
    if len(secret) <= keep * 2:
        return "*" * len(secret)
    return f"{secret[:keep]}…{secret[-keep:]}"


# --- content generation dispatch ----------------------------------------
def _clean_post_text(text: str, max_chars: int) -> str:
    """Apply the same output contract to every AI provider."""
    text = (text or "").strip()
    if len(text) >= 2 and text[0] in "\"'" and text[-1] == text[0]:
        text = text[1:-1].strip()
    if not text:
        raise GeminiError("AI доставчикът върна празен текст.")
    if max_chars and len(text) > max_chars:
        trimmed = text[:max_chars]
        cut = trimmed.rsplit(" ", 1)[0]
        text = (cut if len(cut) > max_chars * 0.6 else trimmed).rstrip()
        if len(text) >= max_chars:
            text = text[: max(1, max_chars - 1)].rstrip()
        text += "…"
    return text


# Replies that are a clarification/refusal rather than a finished post. Some
# agentic CLIs (e.g. Antigravity/Codex) answer "I need a brief …" instead of
# writing the post — we must NOT save that as a published post.
_NON_POST_SIGNALS = (
    "i need a brief", "provide the brief", "please provide", "could you provide",
    "give me a brief", "no brief", "what would you like", "i don't have enough",
    "i do not have enough", "i cannot", "i can't", "i am unable", "i'm unable",
    "as an ai", "i'm sorry, but", "i am sorry, but", "please share",
    "нямам достатъчно", "няма достатъчно", "предоставете", "дайте ми",
    "не мога да", "каква информация",
)
_STRICT_SUFFIX = (
    "IMPORTANT: The brief is already provided above. Do NOT ask for a brief, do "
    "NOT ask questions, do NOT explain yourself. Output ONLY the finished "
    "Facebook post text, nothing else."
)
_NON_POST_MESSAGE = (
    "AI доставчикът не написа публикация (поиска уточнение или отказа). Проверете "
    "доставчика с бутона „Тест на доставчика“ или сменете доставчика в Настройка."
)


def _looks_like_non_post(text: str) -> bool:
    """True if the model asked for clarification / refused instead of posting."""
    low = (text or "").strip().lower()
    if not low:
        return True
    # Only short replies are flagged — a real post that merely contains "please"
    # must not be rejected.
    return len(low) <= 240 and any(sig in low for sig in _NON_POST_SIGNALS)


def _provider_generate(config: Config, context: str, instruction: str, progress, cancel_event) -> str:
    if config.ai_provider == "openai":
        from .openai_client import generate_post

        return generate_post(config, context)
    from . import cli_provider

    if cli_provider.is_cli_provider(config.ai_provider):  # antigravity / codex
        return cli_provider.generate(
            config.ai_provider, instruction, progress=progress, cancel_event=cancel_event
        )
    return gemini_client.generate(
        instruction, model=config.gemini_model, progress=progress, cancel_event=cancel_event
    )


def generate_text(config: Config, context: str, *, progress=None, cancel_event=None) -> str:
    """Generate a post and verify it's an actual post — retry once, else raise."""
    instruction = (
        "Write ONE engaging, ready-to-publish Facebook post based on the brief "
        f"below. Write in {config.post_language}. Keep it under "
        f"{config.post_max_chars} characters. Use a natural, human tone with 1-3 "
        "relevant hashtags only when they fit. Do not use markdown or surrounding "
        "quotes — return ONLY the post text.\n\n=== BRIEF ===\n" + context
    )
    text = _clean_post_text(
        _provider_generate(config, context, instruction, progress, cancel_event),
        config.post_max_chars,
    )
    if not _looks_like_non_post(text):
        return text

    # The model asked for a brief / refused — try once more, firmly.
    if progress:
        progress("AI поиска уточнение — опитвам пак по-категорично …")
    text = _clean_post_text(
        _provider_generate(
            config, context, instruction + "\n\n" + _STRICT_SUFFIX, progress, cancel_event
        ),
        config.post_max_chars,
    )
    if _looks_like_non_post(text):
        raise GeminiError(_NON_POST_MESSAGE)
    return text


# --- core cycle ----------------------------------------------------------
def execute_cycle(
    config: Config,
    memory: MemoryStore,
    fb: FacebookClient,
    *,
    dry_run: bool,
    progress=None,
    cancel_event=None,
) -> dict:
    """Generate and optionally publish one post, recording every outcome."""
    emit = progress or (lambda _message: None)
    if not dry_run and memory.latest_unknown_execution():
        raise PendingPublicationError(
            "Предишното публикуване е с неизвестен резултат. Проверете Facebook "
            "страницата и потвърдете резултата в таблото преди ново публикуване."
        )
    execution_id = memory.start_execution(
        "generate" if dry_run else "publish",
        provider=config.ai_provider,
    )
    final_status = None

    # Use existing engagement learnings immediately. Slow Facebook engagement reads
    # run after publishing, so generation never waits on up to several API calls.
    from . import engagement

    try:
        emit("Loaded configuration.")
        try:
            emit("Refreshing learned engagement file from cached data.")
            engagement.write_skill_md(memory, MEMORY_DIR)
        except Exception as exc:  # noqa: BLE001 - learning must never block generation
            log.debug("Could not refresh skill.md from existing data: %s", exc)
            emit("Skipped cached engagement refresh.")

        emit("Building memory context.")
        log.info("Building context from local memory ...")
        context = memory.build_context(max_recent=6, max_knowledge_chars=3000)

        from . import cli_provider

        provider = cli_provider.label(config.ai_provider)
        emit(f"Calling {provider}.")
        log.info("Generating a post with %s ...", provider)
        text = generate_text(
            config,
            context,
            progress=emit,
            cancel_event=cancel_event,
        )
        memory.update_execution(execution_id, "generated", content=text)
        final_status = "generated"
        emit(f"AI returned {len(text)} characters.")
        log.info("Draft post (%d chars):\n----------\n%s\n----------", len(text), text)

        if dry_run:
            memory.add_post(text, fb_post_id=None, status="dry_run", model=config.ai_provider)
            emit("Saved draft as dry-run memory record.")
            log.info("DRY RUN — not publishing to Facebook. (Saved to memory.)")
            return {"ok": True, "published": False, "text": text, "execution_id": execution_id}

        memory.update_execution(execution_id, "publishing", content=text)
        final_status = "publishing"
        emit("Publishing post to Facebook.")
        log.info("Publishing to Facebook Page %s ...", config.fb_page_id)
        post_id = fb.post(text)
        memory.add_post(text, fb_post_id=post_id, status="published", model=config.ai_provider)
        memory.update_execution(
            execution_id,
            "published",
            content=text,
            fb_post_id=post_id,
        )
        final_status = "published"
        engagement.learn_background(memory, fb, MEMORY_DIR)
        emit(f"Published to Facebook with id {post_id}.")
        emit("Queued background engagement learning.")
        log.info("Published successfully. Facebook post id: %s", post_id)
        return {
            "ok": True,
            "published": True,
            "post_id": post_id,
            "text": text,
            "execution_id": execution_id,
        }
    except FacebookAmbiguousWriteError as exc:
        memory.update_execution(execution_id, "unknown", error=str(exc))
        final_status = "unknown"
        emit(f"Publication state is unknown: {exc}")
        raise
    except GeminiCancelledError as exc:
        memory.update_execution(execution_id, "cancelled", error=str(exc))
        final_status = "cancelled"
        emit("Operation cancelled.")
        raise
    except Exception as exc:
        if final_status not in {"published", "unknown", "cancelled"}:
            memory.update_execution(execution_id, "failed", error=str(exc))
        emit(f"Error: {exc}")
        raise


def run_cycle(config: Config, memory: MemoryStore, fb: FacebookClient, *, dry_run: bool) -> bool:
    execute_cycle(config, memory, fb, dry_run=dry_run)
    return True


def safe_cycle(config: Config, memory: MemoryStore, fb: FacebookClient, *, dry_run: bool) -> bool:
    """run_cycle wrapped so the scheduler can never be killed by an exception."""
    try:
        return run_cycle(config, memory, fb, dry_run=dry_run)
    except GeminiAuthError as exc:
        log.error("AI provider not logged in: %s — run `./run.sh login-gemini`.", exc)
    except GeminiNotInstalled as exc:
        log.error("AI CLI unavailable: %s", exc)
    except GeminiRateLimitError as exc:
        log.warning("AI доставчикът е временно претоварен: %s — ще опитаме пак следващия път.", exc)
    except GeminiCancelledError:
        log.info("AI generation was cancelled.")
    except GeminiError as exc:
        log.error("AI generation failed: %s — will try again next cycle.", exc)
    except FacebookAuthError as exc:
        log.error("Facebook token invalid: %s — re-run `./run.sh setup`.", exc)
    except FacebookRateLimitError as exc:
        log.warning("Facebook rate limit: %s — will try again next cycle.", exc)
    except FacebookAmbiguousWriteError as exc:
        log.error("Facebook publication state is unknown: %s", exc)
    except PendingPublicationError as exc:
        log.error("Publishing paused: %s", exc)
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
        from . import cli_provider

        if config.ai_provider == "gemini":
            print(f"Gemini model     : {config.gemini_model}")
            print(f"Gemini CLI       : {'installed' if gemini_client.cli_path() else 'NOT installed'}")
        elif cli_provider.is_cli_provider(config.ai_provider):
            print(f"AI CLI           : {cli_provider.bin_name(config.ai_provider)}")
            print(f"AI CLI status    : {'installed' if cli_provider.cli_path(config.ai_provider) else 'NOT installed'}")
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


def cmd_clear_memory(memory: MemoryStore) -> int:
    """Interactively wipe accumulated memory (post history, learnings, profile)."""
    print("\n  Изчистване на паметта на AIPost247")
    print("  " + "-" * 36)
    print("  Паметта е това, което AI ползва като контекст: история на")
    print("  публикациите, наученото от ангажираността и бизнес профилът.")
    print("  Какво да изтрия?")
    print("    [1] Всичко (история, знания, инструкции, business.md, skill.md, steering.md)")
    print("    [2] Само историята на публикациите")
    print("    [3] Само наученото от ангажираността (skill.md)")
    print("    [4] Отказ")
    choice = input("  Вашият избор [1-4]: ").strip()

    if choice in {"", "4"}:
        print("  Отказано — нищо не е променено.")
        return 0

    if choice == "1":
        confirm = input(
            "  Сигурни ли сте? Това е необратимо. Напишете 'да' за потвърждение: "
        ).strip().lower()
        if confirm not in {"да", "da", "yes", "y"}:
            print("  Отказано — нищо не е променено.")
            return 0
        removed = memory.clear(posts=True, instructions=True, knowledge=True)
        files = memory.clear_learned_files()
        print(
            f"  ✓ Изтрито: {removed.get('posts', 0)} публикации, "
            f"{removed.get('knowledge', 0)} знания, "
            f"{removed.get('instructions', 0)} инструкции."
        )
        if files:
            print("  ✓ Изтрити файлове: " + ", ".join(files))
        print("  (Ръчно добавените файлове в memory/knowledge/ и memory/instructions.md")
        print("   остават непроменени — изтрийте ги ръчно при нужда.)")
        return 0

    if choice == "2":
        removed = memory.clear(posts=True, instructions=False, knowledge=False)
        print(f"  ✓ Изтрити {removed.get('posts', 0)} публикации от историята.")
        return 0

    if choice == "3":
        files = memory.clear_learned_files(names=("skill.md",))
        print("  ✓ Изтрит skill.md." if files else "  Нямаше skill.md за изтриване.")
        return 0

    print("  Невалиден избор — нищо не е променено.")
    return 0


def _ai_text(config: Config, prompt: str, *, progress=None, cancel_event=None) -> str:
    """Raw text completion via the configured provider (used for steering)."""
    if config.ai_provider == "openai":
        from .openai_client import complete

        return complete(config, prompt)
    from . import cli_provider

    if cli_provider.is_cli_provider(config.ai_provider):
        return cli_provider.generate(
            config.ai_provider,
            prompt,
            progress=progress,
            cancel_event=cancel_event,
        )
    return gemini_client.generate(
        prompt,
        model=config.gemini_model,
        progress=progress,
        cancel_event=cancel_event,
    )


_STEERING_PROMPT = (
    "You maintain a SHORT style guide for one Facebook Page's posts, as a concise "
    "bullet list of concrete, actionable rules.\n\n"
    "CURRENT STYLE GUIDE:\n{current}\n\n"
    'NEW FEEDBACK from the Page owner about the latest post:\n"{feedback}"\n\n'
    "Rewrite the style guide so it incorporates the new feedback:\n"
    "- If the new feedback CONTRADICTS an existing rule, REPLACE the old rule "
    "(newest wins). Never keep both sides of a contradiction.\n"
    "- Merge related points, remove redundancy, keep at most 8 short bullets.\n"
    "- Each bullet is one concrete instruction.\n"
    "- Write the rules in {language}.\n"
    '- Output ONLY the bullet list (each line starting with "- "). No preamble.'
)


def apply_feedback_fast(memory: MemoryStore, feedback: str) -> None:
    """Write owner feedback to steering.md immediately, without waiting for AI."""
    text = feedback.strip()
    if not text:
        return
    existing = memory.read_steering_file()
    bullets = [ln.strip() for ln in existing.splitlines() if ln.strip().startswith("-")]
    new_bullet = f"- {text}"
    merged = [new_bullet]
    for bullet in bullets:
        if bullet.lower() != new_bullet.lower():
            merged.append(bullet)
    memory.write_steering_file(
        "# Style rules (newest first; AI may consolidate these in the background)\n\n"
        + "\n".join(merged[:8])
    )


def _consolidate_steering(
    config: Config,
    memory: MemoryStore,
    feedback: str,
    *,
    progress=None,
    cancel_event=None,
) -> bool:
    """Merge feedback into ONE non-contradictory style guide (self-correcting; no drift).

    Returns True if the AI consolidated it; False if it fell back to a simple merge.
    """
    current = memory.read_steering_file() or "(empty)"
    prompt = _STEERING_PROMPT.format(
        current=current, feedback=feedback, language=config.post_language
    )
    try:
        updated = _ai_text(
            config,
            prompt,
            progress=progress,
            cancel_event=cancel_event,
        ).strip()
        lines = [ln for ln in updated.splitlines() if ln.strip().startswith(("-", "•", "*"))]
        guide = "\n".join(lines).strip()
        if not guide:
            raise ValueError("empty consolidation result")
        memory.write_steering_file("# Style rules (auto-updated from your feedback)\n\n" + guide)
        return True
    except Exception as exc:  # noqa: BLE001 - fall back to a bounded, newest-wins merge
        log.warning("Steering consolidation via AI failed (%s); using simple merge.", exc)
        apply_feedback_fast(memory, feedback)
        return False


def _prompt_post_feedback(config: Config, memory: MemoryStore) -> None:
    """After a post, let the user steer the next one. Interactive sessions only."""
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        return
    print("\n  ----------------------------------------------------------------")
    print("  Насочете следващите публикации (по избор):")
    print("    • Какво харесахте, или какво да променим — напр. „по-кратко“,")
    print("      „повече емоджи“, „по-малко продажбено“, „добави подкана за действие“.")
    print("    • Натиснете Enter, за да пропуснете.")
    try:
        feedback = input("  Вашата обратна връзка: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return
    if not feedback:
        print("  Пропуснато.")
        return
    apply_feedback_fast(memory, feedback)
    print("  ✓ Готово — стилът е записан веднага и важи за следващите публикации.")


def run_loop(config: Config, memory: MemoryStore, fb: FacebookClient) -> int:
    # Pre-flight checks so the loop never starts in a known-broken state.
    if config.ai_provider != "openai":
        from . import cli_provider

        try:
            cli_provider.ensure_provider(config)
        except GeminiError as exc:
            log.error("AI CLI липсва: %s", exc)
            log.error("Инсталирайте го, после `./run.sh login-gemini`, или `./run.sh setup` и изберете OpenAI. НЕ стартирам.")
            return 1
        if not cli_provider.is_logged_in(config):
            log.warning("AI доставчикът (%s) не е влязъл — опитвам вход сега ...", config.ai_provider)
            try:
                cli_provider.login_provider(config)
            except GeminiError as exc:
                log.error("Входът се провали: %s", exc)
            if not cli_provider.is_logged_in(config):
                log.error("НЕ стартирам: %s не е влязъл. Изпълнете `./run.sh login-gemini`, "
                          "или `./run.sh setup` и изберете OpenAI.", config.ai_provider)
                return 1
        log.info("AI доставчикът (%s) е влязъл и готов.", config.ai_provider)

    try:
        name = fb.validate()
        log.info("Connected to Facebook Page: %s (id %s)", name, config.fb_page_id)
    except FacebookAuthError as exc:
        log.error("Facebook token invalid: %s. Run `./run.sh setup`.", exc)
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
        description="Autonomous Facebook auto-poster (AI provider + Graph API).",
    )
    parser.add_argument("--version", action="version", version=f"AIPost247 {__version__}")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("dashboard", help="Open the web dashboard to configure + monitor (default).")
    sub.add_parser("setup", help="Interactive configuration wizard (terminal).")
    sub.add_parser("run", help="Start the autonomous scheduler loop (headless).")
    sub.add_parser("post-now", help="Generate and publish one post immediately.")
    sub.add_parser("generate", help="Generate one post and print it (does NOT publish).")
    sub.add_parser("status", help="Show configuration and recent posts.")
    sub.add_parser("login-gemini", help="Log in to the selected login-only AI provider.")
    sub.add_parser("train", help="Open the 'train your business' form (saved as a skill).")
    sub.add_parser("learn", help="Read post engagement and refresh skill.md (what works).")
    sub.add_parser("clear-memory", help="Wipe accumulated memory (history, learnings, profile).")

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

    command = args.command or "dashboard"

    if command == "dashboard":
        from . import dashboard

        return dashboard.run_dashboard()

    if command == "setup":
        run_setup_wizard(load_config())
        return 0

    if command == "login-gemini":
        from . import cli_provider

        try:
            return 0 if cli_provider.login_provider(load_config()) else 1
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
        if command == "clear-memory":
            return cmd_clear_memory(memory)

        fb = FacebookClient(
            config.fb_page_id,
            config.fb_page_access_token,
            app_id=config.fb_app_id,
            app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )

        if command == "learn":
            from . import engagement

            updated = engagement.sync(memory, fb, limit=25)
            path = engagement.write_skill_md(memory, MEMORY_DIR)
            log.info(
                "Read engagement for %d post(s); skill.md %s.",
                updated, "updated" if path else "not written yet (no engagement)",
            )
            return 0
        if command == "generate":
            ok = safe_cycle(config, memory, fb, dry_run=True)
            if ok:
                _prompt_post_feedback(config, memory)
            return 0 if ok else 1
        if command == "post-now":
            ok = safe_cycle(config, memory, fb, dry_run=False)
            if ok:
                _prompt_post_feedback(config, memory)
            return 0 if ok else 1
        if command == "run":
            return run_loop(config, memory, fb)

        log.error("Unknown command: %s", command)
        return 2
    finally:
        from . import engagement

        engagement.wait_for_background()
        memory.close()
