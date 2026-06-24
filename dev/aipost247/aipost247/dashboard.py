"""Local web dashboard — configure and monitor AIPost247 in the browser.

Run with ``python run.py dashboard`` (or just ``run.bat`` / ``./run.sh`` with no
arguments). Serves a single-page UI on http://localhost:8730 plus a small JSON
API. Everything stays on your machine; secrets are never sent to the browser.
"""
from __future__ import annotations

import json
import os
import secrets
import threading
import time
import urllib.parse
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import config as cfg
from .logging_setup import get_logger
from .memory import MemoryStore

log = get_logger("dashboard")

DEFAULT_PORT = 8730
MAX_REQUEST_BYTES = 64 * 1024
_SESSION_TOKEN = secrets.token_urlsafe(32)


# --------------------------------------------------------------------------
# Autopilot — runs the posting loop in a background thread (start/stop from UI)
# --------------------------------------------------------------------------
class Autopilot:
    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_run_at: str | None = None
        self.last_result: str | None = None
        self.next_run_at: str | None = None

    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self, memory: MemoryStore) -> None:
        if self.running():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, args=(memory,), daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self.next_run_at = None

    def wait(self, timeout: float = 10.0) -> None:
        thread = self._thread
        if thread and thread is not threading.current_thread():
            thread.join(timeout)

    def _seconds_until_next(self, config) -> float:
        if config.schedule_mode == "daily" and config.schedule_times:
            now = datetime.now()
            best = None
            for t in config.schedule_times:
                try:
                    hh, mm = (int(x) for x in t.split(":"))
                except ValueError:
                    continue
                target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
                delta = (target - now).total_seconds()
                if delta <= 0:
                    delta += 86400
                best = delta if best is None else min(best, delta)
            return best if best is not None else 3600.0
        return max(60.0, config.schedule_interval_minutes * 60.0)

    def _run_once(self, memory: MemoryStore) -> None:
        job_id = _COORDINATOR.start(
            "autopilot",
            lambda progress, cancel: _do_cycle(
                memory,
                dry_run=cfg.load_config().dry_run,
                progress=progress,
                cancel_event=cancel,
            ),
        )
        if not job_id:
            self.last_run_at = datetime.now().isoformat(timespec="seconds")
            self.last_result = "skipped_busy"
            return
        state = _COORDINATOR.wait(job_id)
        result = (state or {}).get("result") or {}
        ok = bool(result.get("ok"))
        self.last_run_at = datetime.now().isoformat(timespec="seconds")
        self.last_result = "ok" if ok else "failed"

    def _loop(self, memory: MemoryStore) -> None:
        config = cfg.load_config()
        if config.run_on_start:
            self._run_once(memory)
        while not self._stop.is_set():
            config = cfg.load_config()
            wait = self._seconds_until_next(config)
            self.next_run_at = datetime.fromtimestamp(time.time() + wait).isoformat(timespec="seconds")
            end = time.time() + wait
            while time.time() < end and not self._stop.is_set():
                time.sleep(min(1.0, max(0.05, end - time.time())))
            if self._stop.is_set():
                break
            self._run_once(memory)


_AUTOPILOT = Autopilot()
_LOGIN_RUNNING = threading.Event()
_FB_PENDING: dict[str, dict] = {}
_FB_PENDING_LOCK = threading.Lock()

class JobCoordinator:
    """One exclusive long-running operation with observable progress."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}
        self._lock = threading.Condition()
        self._active_job: str | None = None
        self._shutting_down = False

    def _log(self, job_id: str, message: str) -> None:
        now = time.time()
        with self._lock:
            state = self._jobs.get(job_id)
            if not state:
                return
            started = state.get("started_at") or now
            logs = list(state.get("log") or [])
            logs.append({
                "elapsed": int(now - started),
                "message": str(message),
                "at": datetime.now().isoformat(timespec="seconds"),
            })
            state["log"] = logs[-300:]
            state["updated_at"] = now
            self._lock.notify_all()
        log.info("[job %s] %s", job_id, message)

    def start(self, kind: str, fn) -> str | None:
        with self._lock:
            if self._shutting_down or self._active_job is not None:
                return None
            job_id = secrets.token_hex(8)
            now = time.time()
            self._jobs[job_id] = {
                "id": job_id,
                "kind": kind,
                "status": "running",
                "result": None,
                "log": [],
                "started_at": now,
                "updated_at": now,
                "cancel_event": threading.Event(),
            }
            self._active_job = job_id
            completed = [
                key for key, value in self._jobs.items()
                if key != job_id and value.get("status") == "done"
            ]
            for stale in completed[:-40]:
                self._jobs.pop(stale, None)

        def _run():
            progress = lambda message: self._log(job_id, message)
            try:
                progress("Job started.")
                result = fn(progress, self._jobs[job_id]["cancel_event"])
                progress("Job finished.")
            except Exception as exc:  # noqa: BLE001
                progress(f"Job failed: {exc}")
                result = {"ok": False, "error": str(exc)}
            with self._lock:
                state = self._jobs.get(job_id, {})
                state.update({"status": "done", "result": result, "updated_at": time.time()})
                state.pop("cancel_event", None)
                self._jobs[job_id] = state
                if self._active_job == job_id:
                    self._active_job = None
                self._lock.notify_all()

        threading.Thread(target=_run, daemon=True, name=f"aipost247-{kind}").start()
        return job_id

    def state(self, job_id: str) -> dict | None:
        with self._lock:
            state = self._jobs.get(job_id)
            if not state:
                return None
            data = {key: value for key, value in state.items() if key != "cancel_event"}
        data["elapsed"] = int(time.time() - (data.get("started_at") or time.time()))
        return data

    def active(self) -> dict | None:
        with self._lock:
            job_id = self._active_job
        return self.state(job_id) if job_id else None

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            state = self._jobs.get(job_id)
            event = state.get("cancel_event") if state else None
            if not event or state.get("status") != "running":
                return False
            event.set()
            self._lock.notify_all()
        self._log(job_id, "Cancellation requested.")
        return True

    def wait(self, job_id: str, timeout: float | None = None) -> dict | None:
        deadline = time.time() + timeout if timeout else None
        with self._lock:
            while True:
                state = self._jobs.get(job_id)
                if not state or state.get("status") == "done":
                    break
                remaining = None if deadline is None else max(0.0, deadline - time.time())
                if remaining == 0:
                    break
                self._lock.wait(timeout=min(0.5, remaining) if remaining else 0.5)
        return self.state(job_id)

    def shutdown(self, timeout: float = 15.0) -> bool:
        with self._lock:
            self._shutting_down = True
            active = self._active_job
        if active:
            self.cancel(active)
            state = self.wait(active, timeout=timeout)
            return bool(state and state.get("status") == "done")
        return True


_COORDINATOR = JobCoordinator()


def _job_state(job_id: str) -> dict | None:
    return _COORDINATOR.state(job_id)


def _with_heartbeat(progress, label: str, fn, interval: float = 10.0):
    """Run a blocking provider call while emitting elapsed-time progress lines."""
    box: dict[str, object] = {}

    def _run():
        try:
            box["result"] = fn()
        except BaseException as exc:  # noqa: BLE001 - re-raised in caller thread
            box["error"] = exc

    thread = threading.Thread(target=_run, daemon=True)
    start = time.time()
    progress(f"{label} started.")
    thread.start()
    while thread.is_alive():
        thread.join(interval)
        if thread.is_alive():
            progress(f"{label} still running ({int(time.time() - start)}s elapsed).")
    if "error" in box:
        raise box["error"]  # type: ignore[misc]
    progress(f"{label} completed in {int(time.time() - start)}s.")
    return box.get("result")


# --------------------------------------------------------------------------
# Data helpers
# --------------------------------------------------------------------------
def _status(memory: MemoryStore) -> dict:
    from . import cli_provider

    config = cfg.load_config()
    ai_logged_in = False
    if config.ai_provider != "openai":
        try:
            ai_logged_in = cli_provider.is_logged_in(config)
        except Exception:  # noqa: BLE001
            ai_logged_in = False
    business_ready = bool(memory.read_business_file().strip())
    readiness = [
        {
            "id": "ai",
            "label": "AI доставчик",
            "ready": config.ai_ready() and (config.ai_provider == "openai" or ai_logged_in),
            "tab": "setup",
        },
        {
            "id": "facebook",
            "label": "Facebook страница",
            "ready": bool(config.fb_page_id and config.fb_page_access_token),
            "tab": "setup",
        },
        {
            "id": "business",
            "label": "Бизнес профил",
            "ready": business_ready,
            "tab": "business",
        },
        {
            "id": "safety",
            "label": "Безопасен преглед",
            "ready": config.dry_run or memory.count_posts() > 0,
            "tab": "overview",
        },
    ]
    stats = memory.stats()
    return {
        "ai_provider": config.ai_provider,
        "ai_ready": config.ai_ready() and (config.ai_provider == "openai" or ai_logged_in),
        "ai_logged_in": ai_logged_in,
        "gemini_logged_in": ai_logged_in,
        "facebook_connected": bool(config.fb_page_id and config.fb_page_access_token),
        "facebook_page_id": config.fb_page_id,
        "configured": config.is_ready(),
        "missing": config.missing(),
        "schedule": _schedule_text(config),
        "dry_run": config.dry_run,
        "post_language": config.post_language,
        "stats": stats,
        "readiness": readiness,
        "active_job": _COORDINATOR.active(),
        "last_failure": stats.get("last_failure"),
        "pending_publication": memory.latest_unknown_execution(),
        "autopilot": {
            "running": _AUTOPILOT.running(),
            "last_run_at": _AUTOPILOT.last_run_at,
            "last_result": _AUTOPILOT.last_result,
            "next_run_at": _AUTOPILOT.next_run_at,
        },
    }


def _schedule_text(config) -> str:
    if config.schedule_mode == "daily":
        return "всеки ден в " + ", ".join(config.schedule_times) if config.schedule_times else "всеки ден"
    mins = config.schedule_interval_minutes
    return f"на всеки {mins // 60} ч" if mins % 60 == 0 and mins >= 60 else f"на всеки {mins} мин"


def _config_public(config) -> dict:
    """Config for the UI — secrets are reported as booleans only, never sent."""
    return {
        "ai_provider": config.ai_provider,
        "gemini_model": config.gemini_model or cfg.DEFAULT_GEMINI_MODEL,
        "openai_model": config.openai_model or cfg.DEFAULT_OPENAI_MODEL,
        "has_openai_key": bool(config.openai_api_key),
        "fb_page_id": config.fb_page_id,
        "has_fb_token": bool(config.fb_page_access_token),
        "fb_app_id": config.fb_app_id,
        "has_fb_app_secret": bool(config.fb_app_secret),
        "graph_api_version": config.graph_api_version or cfg.DEFAULT_GRAPH_VERSION,
        "schedule_mode": config.schedule_mode,
        "schedule_interval_minutes": config.schedule_interval_minutes,
        "schedule_times": ",".join(config.schedule_times),
        "run_on_start": config.run_on_start,
        "dry_run": config.dry_run,
        "post_max_chars": config.post_max_chars,
        "post_language": config.post_language,
    }


def _save_config(data: dict) -> None:
    existing = cfg.load_config()
    cfg._write_env(cfg.validate_dashboard_config(data, existing))


def _do_cycle(
    memory: MemoryStore,
    dry_run: bool,
    progress=lambda _message: None,
    cancel_event=None,
) -> dict:
    from . import app as _app
    from .facebook_client import FacebookClient, FacebookError

    config = cfg.load_config()
    try:
        fb = FacebookClient(
            config.fb_page_id, config.fb_page_access_token,
            app_id=config.fb_app_id, app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )
        progress("Prepared Facebook client.")
        return _app.execute_cycle(
            config,
            memory,
            fb,
            dry_run=dry_run,
            progress=progress,
            cancel_event=cancel_event,
        )
    except FacebookError as exc:
        progress(f"Facebook error: {exc}")
        return {"ok": False, "error": f"Facebook: {exc}"}
    except Exception as exc:  # noqa: BLE001
        progress(f"Error: {exc}")
        return {"ok": False, "error": str(exc)}


def _tail_log(lines: int = 200) -> str:
    path = cfg.LOGS_DIR / "aipost247.log"
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return "".join(fh.readlines()[-lines:])
    except OSError:
        return "(няма лог файл още)"


# --------------------------------------------------------------------------
# HTTP handler
# --------------------------------------------------------------------------
class _Handler(BaseHTTPRequestHandler):
    memory: MemoryStore = None  # type: ignore[assignment]

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                "connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; "
                "base-uri 'none'; form-action 'self'",
            )
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # The browser closed the connection (navigated away / slow request).
            # Harmless — don't crash the worker thread with a traceback.
            log.debug("Client disconnected before response was sent.")

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def _body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        if length > MAX_REQUEST_BYTES:
            raise ValueError("Заявката е прекалено голяма.")
        if "application/json" not in (self.headers.get("Content-Type") or "").lower():
            raise TypeError("Очаква се application/json.")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ValueError("Невалиден JSON.")
        if not isinstance(data, dict):
            raise TypeError("JSON заявката трябва да е обект.")
        return data

    def _request_host_ok(self) -> bool:
        host = self.headers.get("Host", "")
        try:
            hostname = urllib.parse.urlsplit("//" + host).hostname
        except ValueError:
            return False
        return hostname in {"localhost", "127.0.0.1", "::1"}

    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        try:
            parsed = urllib.parse.urlsplit(origin)
            expected_port = int(self.server.server_address[1])
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
        except (TypeError, ValueError):
            return False
        return (
            parsed.scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            and port == expected_port
        )

    def _token_ok(self) -> bool:
        supplied = self.headers.get("X-AIPost-Token", "")
        if not supplied and "?" in self.path:
            query = urllib.parse.parse_qs(self.path.split("?", 1)[1])
            supplied = (query.get("token") or [""])[0]
        return secrets.compare_digest(supplied, _SESSION_TOKEN)

    def _authorize_api(self) -> bool:
        if self._request_host_ok() and self._origin_ok() and self._token_ok():
            return True
        self._json({"ok": False, "error": "Forbidden"}, 403)
        return False

    def log_message(self, *_args):  # silence default access logging
        return

    def _start_exclusive(self, kind: str, fn) -> None:
        job_id = _COORDINATOR.start(kind, fn)
        if not job_id:
            active = _COORDINATOR.active()
            self._json(
                {
                    "ok": False,
                    "error": "Друга операция вече работи. Изчакайте я или я отменете.",
                    "active_job": active,
                },
                409,
            )
            return
        self._json({"ok": True, "job": job_id, "kind": kind}, 202)

    def _event_stream(self, mode: str) -> None:
        query = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
        job_id = (query.get("id") or [""])[0]
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            last_payload = None
            while True:
                if mode == "job":
                    payload = _job_state(job_id) or {"status": "unknown"}
                    event_name = "job"
                elif mode == "logs":
                    payload = {"log": _tail_log()}
                    event_name = "logs"
                else:
                    payload = {
                        "status": _status(self.memory),
                        "active_job": _COORDINATOR.active(),
                    }
                    event_name = "state"
                encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                if encoded != last_payload:
                    message = f"event: {event_name}\ndata: {encoded}\n\n".encode("utf-8")
                    self.wfile.write(message)
                    self.wfile.flush()
                    last_payload = encoded
                if mode == "job" and payload.get("status") in {"done", "unknown"}:
                    break
                time.sleep(0.75)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return

    # -- GET --------------------------------------------------------------
    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            if not self._request_host_ok():
                self._json({"error": "forbidden"}, 403)
                return
            page = _PAGE.replace("__AIPOST_SESSION_TOKEN__", _SESSION_TOKEN)
            self._send(200, page.encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/dashboard.css":
            if not self._request_host_ok():
                self._json({"error": "forbidden"}, 403)
                return
            self._send(
                200,
                (_ASSET_DIR / "dashboard.css").read_bytes(),
                "text/css; charset=utf-8",
            )
        elif path == "/dashboard.js":
            if not self._request_host_ok():
                self._json({"error": "forbidden"}, 403)
                return
            self._send(
                200,
                (_ASSET_DIR / "dashboard.js").read_bytes(),
                "text/javascript; charset=utf-8",
            )
        elif path.startswith("/api/") and not self._authorize_api():
            return
        elif path == "/api/status":
            self._json(_status(self.memory))
        elif path == "/api/config":
            self._json(_config_public(cfg.load_config()))
        elif path == "/api/posts":
            self._json({
                "posts": self.memory.recent_posts_detailed(60),
                "executions": self.memory.recent_executions(60),
            })
        elif path == "/api/memory":
            from . import business

            self._json({
                "business": self.memory.read_business_file(),
                "business_fields": business.load_profile(cfg.MEMORY_DIR),
                "skill": self.memory.read_skill_file(),
                "steering": self.memory.read_steering_file(),
                "instructions": self.memory.get_instructions(),
            })
        elif path == "/api/logs":
            self._json({"log": _tail_log()})
        elif path == "/api/job":
            qs = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
            state = _job_state((qs.get("id") or [""])[0])
            self._json(state or {"status": "unknown"})
        elif path == "/api/events":
            self._event_stream("state")
        elif path == "/api/job-events":
            self._event_stream("job")
        elif path == "/api/log-events":
            self._event_stream("logs")
        else:
            self._json({"error": "not found"}, 404)

    # -- POST -------------------------------------------------------------
    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if not self._authorize_api():
            return
        try:
            data = self._body()
            if path == "/api/config":
                _save_config(data)
                self._json({"ok": True})
            elif path == "/api/generate":
                mem = self.memory
                self._start_exclusive(
                    "generate",
                    lambda progress, cancel: _do_cycle(
                        mem, dry_run=True, progress=progress, cancel_event=cancel
                    ),
                )
            elif path == "/api/post-now":
                mem = self.memory
                self._start_exclusive(
                    "publish",
                    lambda progress, cancel: _do_cycle(
                        mem, dry_run=False, progress=progress, cancel_event=cancel
                    ),
                )
            elif path == "/api/learn":
                self._start_exclusive("learn", self._learn)
            elif path == "/api/login-gemini":
                self._json(self._login_gemini(data))
            elif path == "/api/check-login":
                from . import cli_provider

                self._json({"ok": True, "logged_in": cli_provider.recheck(cfg.load_config())})
            elif path == "/api/test-provider":
                from . import cli_provider

                self._start_exclusive(
                    "provider-test",
                    lambda progress, _cancel: _with_heartbeat(
                        progress, "Provider test", lambda: cli_provider.raw_probe(cfg.load_config())
                    ),
                )
            elif path == "/api/facebook/connect":
                self._json(self._fb_connect(data))
            elif path == "/api/facebook/select-page":
                self._json(self._fb_select_page(data))
            elif path == "/api/business":
                self._json(self._save_business(data))
            elif path == "/api/feedback":
                result = self._feedback(data)
                self._json(result, 202 if result.get("ok") else 409)
            elif path == "/api/autopilot":
                self._json(self._autopilot(data))
            elif path == "/api/job/cancel":
                job_id = str(data.get("job") or "")
                ok = _COORDINATOR.cancel(job_id)
                self._json({"ok": ok}, 200 if ok else 404)
            elif path == "/api/publication/resolve":
                execution_id = int(data.get("execution_id") or 0)
                outcome = str(data.get("outcome") or "")
                if outcome not in {"published", "not_published"}:
                    raise ValueError("Невалиден резултат от проверката.")
                if _COORDINATOR.active():
                    self._json(
                        {"ok": False, "error": "Изчакайте текущата операция да приключи."},
                        409,
                    )
                    return
                ok = self.memory.resolve_unknown_execution(
                    execution_id,
                    published=outcome == "published",
                )
                self._json({"ok": ok}, 200 if ok else 409)
            else:
                self._json({"error": "not found"}, 404)
        except (ValueError, TypeError) as exc:
            self._json({"ok": False, "error": str(exc)}, 413 if "голяма" in str(exc) else 400)
        except Exception as exc:  # noqa: BLE001 - never 500 silently
            log.exception("Dashboard API error on %s", path)
            self._json({"ok": False, "error": str(exc)}, 200)

    # -- action implementations ------------------------------------------
    def _learn(self, progress=lambda _message: None, cancel_event=None) -> dict:
        from . import engagement
        from .facebook_client import FacebookClient, FacebookError

        config = cfg.load_config()
        progress("Loaded configuration.")
        fb = FacebookClient(
            config.fb_page_id, config.fb_page_access_token,
            app_id=config.fb_app_id, app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )
        try:
            progress("Reading engagement from Facebook for recent posts.")
            if cancel_event is not None and cancel_event.is_set():
                return {"ok": False, "error": "Операцията беше отменена."}
            updated = engagement.sync(self.memory, fb, limit=25)
            progress(f"Engagement refreshed for {updated} post(s).")
            engagement.write_skill_md(self.memory, cfg.MEMORY_DIR)
            progress("Updated memory/skill.md.")
            return {"ok": True, "updated": updated}
        except FacebookError as exc:
            progress(f"Facebook error: {exc}")
            return {"ok": False, "error": str(exc)}

    def _login_gemini(self, data: dict) -> dict:
        from . import cli_provider

        # If the UI picked a provider but hasn't saved yet, honour it for login.
        prov = (data or {}).get("provider")
        if prov and prov != cfg.load_config().ai_provider:
            cfg._write_env({"AI_PROVIDER": prov})
        config = cfg.load_config()
        # Probe first — catches a login already done (here or manually elsewhere).
        if cli_provider.recheck(config):
            return {"ok": True, "logged_in": True, "already": True, "provider": config.ai_provider}
        if _LOGIN_RUNNING.is_set():
            return {"ok": True, "started": True,
                    "message": "Входът вече тече — завършете го в прозореца на ТЕРМИНАЛА."}

        # The CLI login is terminal-interactive (open a URL, maybe paste a code),
        # so run it in the background and let the user complete it in the terminal
        # window. The status panel updates itself once it succeeds.
        _LOGIN_RUNNING.set()

        def _bg():
            try:
                cli_provider.login_provider(config)
            except Exception as exc:  # noqa: BLE001
                log.warning("Login (%s) failed: %s", config.ai_provider, exc)
            finally:
                _LOGIN_RUNNING.clear()

        threading.Thread(target=_bg, daemon=True).start()
        if config.ai_provider == "codex":
            msg = ("Завършете входа в прозореца на ТЕРМИНАЛА, ако Codex го поиска. "
                   "Генерирането после ще работи в отделна временна папка. "
                   "Състоянието тук ще се обнови само.")
        else:
            msg = ("Завършете входа в прозореца на ТЕРМИНАЛА, където стартирахте "
                   "програмата (отворете показаната връзка; ако се поиска код — "
                   "поставете го там). Състоянието тук ще се обнови само.")
        return {"ok": True, "started": True, "provider": config.ai_provider,
                "message": msg}

    def _fb_connect(self, data: dict) -> dict:
        from .facebook_client import FacebookError
        from .fb_oauth import login_and_list_pages

        app_id = (data.get("fb_app_id") or "").strip()
        app_secret = (data.get("fb_app_secret") or "").strip()
        if not (app_id and app_secret):
            existing = cfg.load_config()
            app_id = app_id or existing.fb_app_id
            app_secret = app_secret or existing.fb_app_secret
        if not (app_id and app_secret):
            return {"ok": False, "error": "Нужни са App ID и App Secret."}
        try:
            api = cfg.load_config().graph_api_version or cfg.DEFAULT_GRAPH_VERSION
            pages = login_and_list_pages(app_id, app_secret, api)
            if len(pages) == 1:
                page = pages[0]
                token = page.get("access_token")
                if not token:
                    return {"ok": False, "error": "Facebook не върна Page token."}
                cfg._write_env({
                    "FB_APP_ID": app_id, "FB_APP_SECRET": app_secret,
                    "FB_PAGE_ID": str(page.get("id")), "FB_PAGE_ACCESS_TOKEN": token,
                })
                return {"ok": True, "page_name": page.get("name", "(page)"),
                        "page_id": str(page.get("id"))}

            pending = secrets.token_hex(8)
            with _FB_PENDING_LOCK:
                _FB_PENDING[pending] = {
                    "created_at": time.time(),
                    "app_id": app_id,
                    "app_secret": app_secret,
                    "pages": pages,
                }
                for key, item in list(_FB_PENDING.items()):
                    if time.time() - item.get("created_at", 0) > 900:
                        _FB_PENDING.pop(key, None)
            return {
                "ok": True,
                "choose_page": True,
                "pending": pending,
                "pages": [
                    {"id": str(page.get("id")), "name": page.get("name", "(без име)")}
                    for page in pages
                ],
            }
        except FacebookError as exc:
            return {"ok": False, "error": str(exc)}

    def _fb_select_page(self, data: dict) -> dict:
        pending = (data.get("pending") or "").strip()
        page_id = (data.get("page_id") or "").strip()
        with _FB_PENDING_LOCK:
            item = _FB_PENDING.get(pending)
        if not item:
            return {"ok": False, "error": "Изборът е изтекъл. Натиснете „Свържи Facebook“ отново."}
        if time.time() - item.get("created_at", 0) > 900:
            with _FB_PENDING_LOCK:
                _FB_PENDING.pop(pending, None)
            return {"ok": False, "error": "Изборът е изтекъл. Натиснете „Свържи Facebook“ отново."}
        page = next((p for p in item["pages"] if str(p.get("id")) == page_id), None)
        if not page:
            return {"ok": False, "error": "Невалидна страница."}
        token = page.get("access_token")
        if not token:
            return {"ok": False, "error": "Facebook не върна Page token за тази страница."}
        cfg._write_env({
            "FB_APP_ID": item["app_id"],
            "FB_APP_SECRET": item["app_secret"],
            "FB_PAGE_ID": str(page.get("id")),
            "FB_PAGE_ACCESS_TOKEN": token,
        })
        with _FB_PENDING_LOCK:
            _FB_PENDING.pop(pending, None)
        return {"ok": True, "page_name": page.get("name", "(page)"), "page_id": str(page.get("id"))}

    def _save_business(self, data: dict) -> dict:
        from . import business

        profile = {k: (data.get(k) or "").strip() for k, _l, _m in business.FIELDS}
        if not any(profile.values()):
            return {"ok": False, "error": "Празна форма."}
        if any(len(value) > 5_000 for value in profile.values()) or sum(map(len, profile.values())) > 20_000:
            return {"ok": False, "error": "Бизнес профилът е прекалено дълъг."}
        path = business.save_profile(cfg.MEMORY_DIR, profile)
        return {"ok": True, "path": str(path)}

    def _feedback(self, data: dict) -> dict:
        from . import app as _app

        text = (data.get("feedback") or "").strip()
        if not text:
            return {"ok": False, "error": "Празна обратна връзка."}
        def work(progress, cancel_event):
            _app.apply_feedback_fast(self.memory, text)
            progress("Style feedback saved locally.")
            if cancel_event.is_set():
                return {
                    "ok": True,
                    "ai_consolidated": False,
                    "steering": self.memory.read_steering_file(),
                }
            return {
                "ok": True,
                "ai_consolidated": _with_heartbeat(
                    progress,
                    "AI style consolidation",
                    lambda: _app._consolidate_steering(
                        cfg.load_config(),
                        self.memory,
                        text,
                        progress=progress,
                        cancel_event=cancel_event,
                    ),
                ),
                "steering": self.memory.read_steering_file(),
            }

        job = _COORDINATOR.start("feedback", work)
        if not job:
            return {
                "ok": False,
                "error": "Друга операция вече работи. Опитайте обратната връзка след нея.",
                "active_job": _COORDINATOR.active(),
            }
        return {
            "ok": True,
            "queued": True,
            "job": job,
            "ai_consolidated": False,
            "steering": self.memory.read_steering_file(),
        }

    def _autopilot(self, data: dict) -> dict:
        action = data.get("action")
        if action == "start":
            if data.get("confirmed") is not True:
                return {"ok": False, "error": "Нужно е потвърждение за стартиране."}
            if not cfg.load_config().is_ready():
                return {"ok": False, "error": "Първо завършете настройката."}
            if self.memory.latest_unknown_execution():
                return {
                    "ok": False,
                    "error": "Първо проверете последното публикуване с неизвестен резултат.",
                }
            _AUTOPILOT.start(self.memory)
        elif action == "stop":
            _AUTOPILOT.stop()
        return {"ok": True, "running": _AUTOPILOT.running()}


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def _bind_server(start_port: int, attempts: int = 25):
    """Bind to the first FREE port from ``start_port`` so several copies of the
    app can run side by side. Falls back to an OS-assigned free port."""
    last_exc: OSError | None = None
    for candidate in range(start_port, start_port + attempts):
        try:
            return ThreadingHTTPServer(("127.0.0.1", candidate), _Handler)
        except OSError as exc:
            last_exc = exc  # port in use (or not allowed) — try the next one
    # Last resort: let the OS pick any free port.
    try:
        return ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    except OSError as exc:
        raise (last_exc or exc)


def run_dashboard(port: int | None = None, open_browser: bool = True) -> int:
    cfg.ensure_dirs()
    cfg.load_config()  # side effect: loads .env into the environment
    if port is None:
        try:
            port = int(os.environ.get("AIPOST_DASHBOARD_PORT", DEFAULT_PORT))
        except (TypeError, ValueError):
            port = DEFAULT_PORT
    _Handler.memory = MemoryStore(str(cfg.DB_PATH), str(cfg.MEMORY_DIR))

    # Best-effort readiness check. Do not install anything on dashboard startup;
    # installation happens only after the user explicitly clicks the login button.
    try:
        config = cfg.load_config()
        if config.ai_provider != "openai":
            from . import cli_provider

            path = cli_provider.ensure_provider(config, auto_install=False)
            print(f"  ✓ AI CLI ({config.ai_provider}) е намерен: {path}")
    except Exception as exc:  # noqa: BLE001 - never block the dashboard
        log.info("AI CLI не е намерен още (%s) — ще се инсталира при вход.", exc)
    requested = port
    try:
        server = _bind_server(requested)
    except OSError as exc:
        log.error("Не мога да стартирам таблото: %s", exc)
        return 1
    port = server.server_address[1]
    url = f"http://localhost:{port}/"
    print("\n  " + "=" * 58)
    if port != requested:
        print(f"  (Порт {requested} е зает — използвам свободен порт {port}.)")
    print(f"  AIPost247 · Таблото е активно:  {url}")
    print("  Отворете го в браузъра. Спрете с Ctrl+C.")
    print("  " + "=" * 58 + "\n")
    if open_browser:
        try:
            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Таблото е спряно.")
    finally:
        _AUTOPILOT.stop()
        workers_stopped = _COORDINATOR.shutdown()
        _AUTOPILOT.wait()
        from . import engagement

        engagement.wait_for_background()
        server.server_close()
        if workers_stopped:
            _Handler.memory.close()
        else:
            log.warning(
                "Active worker did not stop in time; leaving SQLite open for process cleanup."
            )
    return 0


_ASSET_DIR = Path(__file__).resolve().parent
_PAGE = (_ASSET_DIR / "dashboard.html").read_text(encoding="utf-8")
