"""Scheduling loop built on the lightweight ``schedule`` library.

Interval mode  -> run every N minutes.
Daily mode     -> run at each HH:MM (machine local time).

The loop catches Ctrl+C cleanly; the *job itself* is expected to swallow its own
errors (see app.safe_cycle) so a single failure never stops the schedule.
"""
from __future__ import annotations

import time
from typing import Callable

import schedule

from .config import Config
from .logging_setup import get_logger

log = get_logger("scheduler")


def describe_schedule(config: Config) -> str:
    if config.schedule_mode == "daily" and config.schedule_times:
        return "daily at " + ", ".join(config.schedule_times) + " (local time)"
    minutes = max(1, config.schedule_interval_minutes)
    hours = minutes / 60
    return f"every {minutes} min (~{hours:.2f} h)"


def _register_jobs(config: Config, job: Callable[[], None]) -> None:
    schedule.clear()
    if config.schedule_mode == "daily" and config.schedule_times:
        for when in config.schedule_times:
            schedule.every().day.at(when).do(job)
    else:
        schedule.every(max(1, config.schedule_interval_minutes)).minutes.do(job)


def run_forever(config: Config, job: Callable[[], None]) -> int:
    """Register jobs and block, running pending jobs once per second."""
    _register_jobs(config, job)

    if config.run_on_start:
        log.info("run_on_start enabled — running one cycle now.")
        job()

    log.info("Scheduler started: %s. Press Ctrl+C to stop.", describe_schedule(config))
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler stopped by user. Goodbye.")
        return 0
