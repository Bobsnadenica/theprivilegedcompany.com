"""OpenAI (ChatGPT) content generation — OPTIONAL provider.

Only used when AI_PROVIDER=openai. The ``openai`` package is imported lazily so
the default (Gemini) install doesn't need it.
"""
from __future__ import annotations

import time

from .config import Config
from .logging_setup import get_logger

log = get_logger("openai")


class OpenAIError(Exception):
    """Generic content-generation failure."""


class OpenAIAuthError(OpenAIError):
    """The OpenAI API key is missing or invalid."""


def _build_system_prompt(config: Config) -> str:
    return (
        "You are an expert social media manager who writes engaging, authentic "
        f"Facebook Page posts. Write in {config.post_language}. "
        f"Keep the post under {config.post_max_chars} characters. "
        "Use a natural, human tone — never robotic or spammy. Add 1-3 relevant "
        "hashtags only when they fit. Do not use markdown, headings, or quotation "
        "marks around the post. Return ONLY the final post text, nothing else."
    )


def _clean(text: str, max_chars: int) -> str:
    text = (text or "").strip()
    if len(text) >= 2 and text[0] in "\"'" and text[-1] == text[0]:
        text = text[1:-1].strip()
    if max_chars and len(text) > max_chars:
        log.warning("Generated post exceeded %d chars; trimming.", max_chars)
        trimmed = text[:max_chars]
        cut = trimmed.rsplit(" ", 1)[0]
        text = (cut if len(cut) > max_chars * 0.6 else trimmed).rstrip() + "…"
    return text


def complete(config: Config, prompt: str, max_tokens: int = 400) -> str:
    """A plain text completion (no post-writing system prompt). Used for steering."""
    if not config.openai_api_key:
        raise OpenAIAuthError("OPENAI_API_KEY is not set.")
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise OpenAIError("The 'openai' package is not installed.") from exc
    client = OpenAI(api_key=config.openai_api_key)
    response = client.chat.completions.create(
        model=config.openai_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=max_tokens,
    )
    return (response.choices[0].message.content or "").strip()


def generate_post(config: Config, context: str, retries: int = 3) -> str:
    """Generate a single Facebook post from the memory-built ``context``."""
    if not config.openai_api_key:
        raise OpenAIAuthError("OPENAI_API_KEY is not set.")

    try:
        from openai import OpenAI
        try:
            from openai import (
                APIConnectionError,
                APIError,
                AuthenticationError,
                RateLimitError,
            )
        except ImportError:  # pragma: no cover
            APIConnectionError = APIError = AuthenticationError = RateLimitError = Exception  # type: ignore
    except ImportError as exc:
        raise OpenAIError(
            "The 'openai' package is not installed. Run `pip install openai` "
            "or re-run `python run.py setup` and choose the OpenAI provider."
        ) from exc

    client = OpenAI(api_key=config.openai_api_key)
    messages = [
        {"role": "system", "content": _build_system_prompt(config)},
        {"role": "user", "content": context},
    ]

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            response = client.chat.completions.create(
                model=config.openai_model,
                messages=messages,
                temperature=0.85,
                max_tokens=500,
            )
            text = _clean(response.choices[0].message.content, config.post_max_chars)
            if not text:
                raise OpenAIError("OpenAI returned an empty post.")
            return text
        except AuthenticationError as exc:
            raise OpenAIAuthError(f"OpenAI rejected the API key: {exc}") from exc
        except RateLimitError as exc:
            last_error = exc
            wait = min(5 * 2 ** attempt, 60)
            log.warning("OpenAI rate limit. Retry %d/%d in %ds.", attempt, retries, wait)
            time.sleep(wait)
        except APIConnectionError as exc:
            last_error = exc
            wait = min(2 ** attempt, 30)
            log.warning("OpenAI connection error (%s). Retry %d/%d in %ds.", exc, attempt, retries, wait)
            time.sleep(wait)
        except APIError as exc:
            status = getattr(exc, "status_code", None)
            if status and 500 <= status < 600:
                last_error = exc
                wait = min(2 ** attempt, 30)
                log.warning("OpenAI server error %s. Retry %d/%d in %ds.", status, attempt, retries, wait)
                time.sleep(wait)
            else:
                raise OpenAIError(f"OpenAI API error: {exc}") from exc

    raise OpenAIError(f"Content generation failed after {retries} attempts: {last_error}")
