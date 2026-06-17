"""Centralised logging: timestamped console output + a rotating log file."""
from __future__ import annotations

import logging
import logging.handlers
import os

_CONFIGURED = False


def setup_logging(logs_dir: str, level: int = logging.INFO) -> None:
    """Configure the ``aipost247`` logger once. Safe to call multiple times."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    os.makedirs(logs_dir, exist_ok=True)
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)-18s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    root = logging.getLogger("aipost247")
    root.setLevel(level)
    root.propagate = False

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    root.addHandler(console)

    file_handler = logging.handlers.RotatingFileHandler(
        os.path.join(logs_dir, "aipost247.log"),
        maxBytes=1_000_000,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    # Keep noisy third-party libraries quiet on the console.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced child logger, e.g. ``aipost247.facebook``."""
    return logging.getLogger(f"aipost247.{name}")
