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

from . import config as cfg
from .logging_setup import get_logger
from .memory import MemoryStore

log = get_logger("dashboard")

DEFAULT_PORT = 8730


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
        from . import app as _app
        from .facebook_client import FacebookClient

        config = cfg.load_config()
        fb = FacebookClient(
            config.fb_page_id, config.fb_page_access_token,
            app_id=config.fb_app_id, app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )
        ok = _app.safe_cycle(config, memory, fb, dry_run=config.dry_run)
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

# Long operations (generate / post / learn) run as background JOBS and the
# browser polls for the result. This keeps HTTP requests short — a slow CLI no
# longer holds the connection open until it breaks (BrokenPipe) or times out.
_JOBS: dict[str, dict] = {}
_JOBS_LOCK = threading.Lock()


def _start_job(fn) -> str:
    job_id = secrets.token_hex(8)
    with _JOBS_LOCK:
        _JOBS[job_id] = {"status": "running", "result": None}
        for stale in list(_JOBS)[:-40]:  # bound memory
            _JOBS.pop(stale, None)

    def _run():
        try:
            result = fn()
        except Exception as exc:  # noqa: BLE001
            result = {"ok": False, "error": str(exc)}
        with _JOBS_LOCK:
            _JOBS[job_id] = {"status": "done", "result": result}

    threading.Thread(target=_run, daemon=True).start()
    return job_id


def _job_state(job_id: str) -> dict | None:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)


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
    return {
        "ai_provider": config.ai_provider,
        "ai_ready": config.ai_ready() and (config.ai_provider == "openai" or ai_logged_in),
        "gemini_logged_in": ai_logged_in,
        "facebook_connected": bool(config.fb_page_id and config.fb_page_access_token),
        "facebook_page_id": config.fb_page_id,
        "configured": config.is_ready(),
        "missing": config.missing(),
        "schedule": _schedule_text(config),
        "dry_run": config.dry_run,
        "post_language": config.post_language,
        "stats": memory.stats(),
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
    values: dict[str, str] = {
        "AI_PROVIDER": data.get("ai_provider", existing.ai_provider) or "gemini",
        "GEMINI_MODEL": data.get("gemini_model") or existing.gemini_model or cfg.DEFAULT_GEMINI_MODEL,
        "OPENAI_MODEL": data.get("openai_model") or existing.openai_model or cfg.DEFAULT_OPENAI_MODEL,
        "GRAPH_API_VERSION": data.get("graph_api_version") or existing.graph_api_version,
        "SCHEDULE_MODE": data.get("schedule_mode", existing.schedule_mode) or "interval",
        "SCHEDULE_INTERVAL_MINUTES": str(data.get("schedule_interval_minutes") or existing.schedule_interval_minutes),
        "SCHEDULE_TIMES": data.get("schedule_times") or ",".join(existing.schedule_times),
        "RUN_ON_START": "true" if data.get("run_on_start", existing.run_on_start) else "false",
        "DRY_RUN": "true" if data.get("dry_run", existing.dry_run) else "false",
        "POST_MAX_CHARS": str(data.get("post_max_chars") or existing.post_max_chars),
        "POST_LANGUAGE": data.get("post_language") or existing.post_language or "Bulgarian",
    }
    # Secrets: only overwrite when a non-empty value is supplied.
    if data.get("openai_api_key"):
        values["OPENAI_API_KEY"] = data["openai_api_key"]
    if data.get("fb_page_id"):
        values["FB_PAGE_ID"] = data["fb_page_id"]
    if data.get("fb_page_access_token"):
        values["FB_PAGE_ACCESS_TOKEN"] = data["fb_page_access_token"]
    if data.get("fb_app_id"):
        values["FB_APP_ID"] = data["fb_app_id"]
    if data.get("fb_app_secret"):
        values["FB_APP_SECRET"] = data["fb_app_secret"]
    cfg._write_env(values)


def _do_cycle(memory: MemoryStore, dry_run: bool) -> dict:
    from . import app as _app, engagement
    from .facebook_client import FacebookClient, FacebookError

    config = cfg.load_config()
    try:
        fb = FacebookClient(
            config.fb_page_id, config.fb_page_access_token,
            app_id=config.fb_app_id, app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )
        try:
            engagement.learn(memory, fb, cfg.MEMORY_DIR)
        except Exception:  # noqa: BLE001 - learning must never block a post
            pass
        text = _app.generate_text(config, memory.build_context())
        if dry_run:
            memory.add_post(text, fb_post_id=None, status="dry_run", model=config.ai_provider)
            return {"ok": True, "published": False, "text": text}
        post_id = fb.post(text)
        memory.add_post(text, fb_post_id=post_id, status="published", model=config.ai_provider)
        return {"ok": True, "published": True, "post_id": post_id, "text": text}
    except FacebookError as exc:
        return {"ok": False, "error": f"Facebook: {exc}"}
    except Exception as exc:  # noqa: BLE001
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
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def log_message(self, *_args):  # silence default access logging
        return

    # -- GET --------------------------------------------------------------
    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, _PAGE.encode("utf-8"), "text/html; charset=utf-8")
        elif path == "/api/status":
            self._json(_status(self.memory))
        elif path == "/api/config":
            self._json(_config_public(cfg.load_config()))
        elif path == "/api/posts":
            self._json({"posts": self.memory.recent_posts_detailed(60)})
        elif path == "/api/memory":
            self._json({
                "business": self.memory.read_business_file(),
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
        else:
            self._json({"error": "not found"}, 404)

    # -- POST -------------------------------------------------------------
    def do_POST(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        data = self._body()
        try:
            if path == "/api/config":
                _save_config(data)
                self._json({"ok": True})
            elif path == "/api/generate":
                mem = self.memory
                self._json({"ok": True, "job": _start_job(lambda: _do_cycle(mem, dry_run=True))})
            elif path == "/api/post-now":
                mem = self.memory
                self._json({"ok": True, "job": _start_job(lambda: _do_cycle(mem, dry_run=False))})
            elif path == "/api/learn":
                self._json({"ok": True, "job": _start_job(self._learn)})
            elif path == "/api/login-gemini":
                self._json(self._login_gemini(data))
            elif path == "/api/check-login":
                from . import cli_provider

                self._json({"ok": True, "logged_in": cli_provider.recheck(cfg.load_config())})
            elif path == "/api/facebook/connect":
                self._json(self._fb_connect(data))
            elif path == "/api/business":
                self._json(self._save_business(data))
            elif path == "/api/feedback":
                self._json(self._feedback(data))
            elif path == "/api/autopilot":
                self._json(self._autopilot(data))
            else:
                self._json({"error": "not found"}, 404)
        except Exception as exc:  # noqa: BLE001 - never 500 silently
            log.exception("Dashboard API error on %s", path)
            self._json({"ok": False, "error": str(exc)}, 200)

    # -- action implementations ------------------------------------------
    def _learn(self) -> dict:
        from . import engagement
        from .facebook_client import FacebookClient, FacebookError

        config = cfg.load_config()
        fb = FacebookClient(
            config.fb_page_id, config.fb_page_access_token,
            app_id=config.fb_app_id, app_secret=config.fb_app_secret,
            api_version=config.graph_api_version,
        )
        try:
            updated = engagement.sync(self.memory, fb)
            engagement.write_skill_md(self.memory, cfg.MEMORY_DIR)
            return {"ok": True, "updated": updated}
        except FacebookError as exc:
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
        return {"ok": True, "started": True, "provider": config.ai_provider,
                "message": ("Завършете входа в прозореца на ТЕРМИНАЛА, където стартирахте "
                            "програмата (отворете показаната връзка; ако се поиска код — "
                            "поставете го там). Състоянието тук ще се обнови само.")}

    def _fb_connect(self, data: dict) -> dict:
        from .facebook_client import FacebookError
        from .fb_oauth import login_and_select_page

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
            page_id, token, name = login_and_select_page(
                app_id, app_secret, api, choose=lambda pages: pages[0]
            )
            cfg._write_env({
                "FB_APP_ID": app_id, "FB_APP_SECRET": app_secret,
                "FB_PAGE_ID": page_id, "FB_PAGE_ACCESS_TOKEN": token,
            })
            return {"ok": True, "page_name": name, "page_id": page_id}
        except FacebookError as exc:
            return {"ok": False, "error": str(exc)}

    def _save_business(self, data: dict) -> dict:
        from . import business

        profile = {k: (data.get(k) or "").strip() for k, _l, _m in business.FIELDS}
        if not any(profile.values()):
            return {"ok": False, "error": "Празна форма."}
        path = business.save_profile(cfg.MEMORY_DIR, profile)
        return {"ok": True, "path": str(path)}

    def _feedback(self, data: dict) -> dict:
        from . import app as _app

        text = (data.get("feedback") or "").strip()
        if not text:
            return {"ok": False, "error": "Празна обратна връзка."}
        consolidated = _app._consolidate_steering(cfg.load_config(), self.memory, text)
        return {"ok": True, "ai_consolidated": consolidated,
                "steering": self.memory.read_steering_file()}

    def _autopilot(self, data: dict) -> dict:
        action = data.get("action")
        if action == "start":
            if not cfg.load_config().is_ready():
                return {"ok": False, "error": "Първо завършете настройката."}
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

    # Best-effort: install the configured AI CLI (default: Antigravity) NOW, before
    # the dashboard opens, so the first action isn't blocked. No-op once installed;
    # never fatal — on failure the dashboard still opens and you can pick another.
    try:
        config = cfg.load_config()
        if config.ai_provider != "openai":
            from . import cli_provider

            print(f"  Проверка/инсталиране на AI CLI ({config.ai_provider}) ...")
            cli_provider.ensure_provider(config)
            print(f"  ✓ {config.ai_provider} е готов.")
    except Exception as exc:  # noqa: BLE001 - never block the dashboard
        log.warning("AI CLI авто-инсталация прескочена (%s) — ще се инсталира при вход.", exc)
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
        server.server_close()
        _Handler.memory.close()
    return 0


_PAGE = r"""<!DOCTYPE html>
<html lang="bg"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AIPost247 · Табло</title>
<style>
  :root{--bg:#eef1f7;--card:#fff;--ink:#16202c;--muted:#5b6b7e;--line:#e2e8f2;
    --accent:#1877f2;--accent-ink:#0b5fd0;--ok:#1f9d57;--bad:#d3392b;--warn:#c9921b;--radius:14px;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  header{background:linear-gradient(135deg,#1877f2,#0b5fd0);color:#fff;padding:18px 24px;
    display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
  header h1{margin:0;font-size:1.25rem;}
  header .sub{opacity:.9;font-size:.85rem;}
  .pillbar{display:flex;gap:8px;flex-wrap:wrap;}
  .pill{font-size:.78rem;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);}
  .pill.ok{background:rgba(31,157,87,.22);border-color:rgba(255,255,255,.4);}
  .pill.bad{background:rgba(211,57,43,.28);border-color:rgba(255,255,255,.4);}
  .wrap{max-width:1040px;margin:0 auto;padding:18px;}
  nav{display:flex;gap:6px;margin:14px 0 18px;flex-wrap:wrap;}
  nav button{cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink);
    font:inherit;font-weight:600;padding:9px 16px;border-radius:999px;}
  nav button.active{background:var(--accent);color:#fff;border-color:var(--accent);}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
    padding:18px 20px;margin-bottom:16px;box-shadow:0 10px 26px -22px rgba(16,32,44,.5);}
  .card h2{margin:0 0 4px;font-size:1.05rem;}
  .card .hint{color:var(--muted);font-size:.85rem;margin:0 0 14px;}
  label{display:block;font-weight:600;margin:12px 0 4px;font-size:.9rem;}
  input,select,textarea{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;
    font:inherit;color:var(--ink);background:#fff;}
  input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(24,119,242,.15);}
  textarea{resize:vertical;min-height:70px;}
  .row{display:flex;gap:14px;flex-wrap:wrap;}
  .row>div{flex:1;min-width:180px;}
  .check{display:flex;align-items:center;gap:8px;margin-top:12px;}
  .check input{width:auto;}
  button.btn{cursor:pointer;border:none;border-radius:10px;font:inherit;font-weight:700;
    padding:10px 18px;background:var(--accent);color:#fff;margin-top:14px;}
  button.btn:hover{background:var(--accent-ink);}
  button.btn.ghost{background:#eef2f8;color:var(--ink);}
  button.btn.ok{background:var(--ok);}
  button.btn.bad{background:var(--bad);}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;}
  .stat{background:#f7f9fd;border:1px solid var(--line);border-radius:12px;padding:12px 14px;}
  .stat .n{font-size:1.5rem;font-weight:800;}
  .stat .l{color:var(--muted);font-size:.8rem;}
  table{width:100%;border-collapse:collapse;font-size:.88rem;}
  th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top;}
  th{color:var(--muted);font-weight:600;background:#f7f9fd;}
  .tag{font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;}
  .tag.published{background:#e4f6ec;color:#1f7a48;}
  .tag.dry_run{background:#fff4e0;color:#9a6b12;}
  .tag.failed{background:#fde4e1;color:#a82d22;}
  pre.log{background:#0f1722;color:#dbe6f5;border-radius:10px;padding:14px;overflow:auto;max-height:60vh;
    font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;}
  .toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#16202c;color:#fff;
    padding:11px 18px;border-radius:10px;box-shadow:0 14px 34px -12px rgba(0,0,0,.5);opacity:0;
    transition:opacity .25s,transform .25s;pointer-events:none;z-index:50;}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(-4px);}
  .out{background:#f7f9fd;border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:12px;white-space:pre-wrap;}
  .muted{color:var(--muted);}
  .hide{display:none;}
  .busy{opacity:.6;pointer-events:none;}
  .help-btn{cursor:pointer;border:1px solid rgba(255,255,255,.5);background:rgba(255,255,255,.16);color:#fff;
    font:inherit;font-weight:700;font-size:.82rem;padding:6px 13px;border-radius:999px;white-space:nowrap;}
  .help-btn:hover{background:rgba(255,255,255,.3);}
  /* guided tour */
  .tour-dim{position:fixed;inset:0;z-index:90;background:transparent;}
  .tour-spot{position:fixed;z-index:91;border-radius:12px;pointer-events:none;
    box-shadow:0 0 0 3px var(--accent),0 0 0 9999px rgba(8,14,22,.6);
    transition:all .3s cubic-bezier(.4,.1,.3,1);}
  .tour-card{position:fixed;z-index:92;background:#fff;border-radius:14px;max-width:330px;width:calc(100vw - 32px);
    box-shadow:0 24px 50px -16px rgba(0,0,0,.5);padding:16px 18px;transition:left .25s ease,top .25s ease;}
  .tour-card h4{margin:0 0 6px;font-size:1.02rem;}
  .tour-card p{margin:0 0 13px;color:var(--muted);font-size:.9rem;line-height:1.5;}
  .tour-card .tnav{display:flex;align-items:center;justify-content:space-between;gap:8px;}
  .tour-card .step-n{color:var(--muted);font-size:.78rem;}
  .tour-card button{cursor:pointer;border:none;border-radius:8px;font:inherit;font-weight:700;font-size:.85rem;padding:7px 13px;margin-left:6px;}
  .tour-card .skip{background:transparent;color:var(--muted);padding:7px 6px;}
  .tour-card .prev{background:#eef2f8;color:var(--ink);}
  .tour-card .next{background:var(--accent);color:#fff;}
</style></head>
<body>
<header>
  <div><h1>AIPost247 · Табло</h1><div class="sub">Конфигурирайте и наблюдавайте — без терминал.</div></div>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
    <div class="pillbar" id="pills"></div>
    <button class="help-btn" id="help-btn" title="Покажи обиколката">? Обиколка</button>
  </div>
</header>
<div class="wrap">
  <nav>
    <button data-tab="overview" class="active">Преглед</button>
    <button data-tab="setup">Настройка</button>
    <button data-tab="business">Бизнес &amp; стил</button>
    <button data-tab="posts">Публикации</button>
    <button data-tab="logs">Дневник</button>
  </nav>

  <!-- OVERVIEW -->
  <section id="tab-overview">
    <div class="card">
      <h2>Състояние</h2>
      <div class="grid" id="stats"></div>
      <div style="margin-top:14px" id="autopilot-box"></div>
    </div>
    <div class="card">
      <h2>Бързи действия</h2>
      <p class="hint">Генерирайте за преглед, публикувайте веднага или опреснете ангажираността.</p>
      <button class="btn ghost" onclick="act('/api/generate','Генерирам…')">Генерирай (преглед)</button>
      <button class="btn" onclick="act('/api/post-now','Публикувам…')">Публикувай сега</button>
      <button class="btn ghost" onclick="act('/api/learn','Уча от ангажираността…')">Опресни наученото</button>
      <div id="action-out" class="out hide"></div>
    </div>
  </section>

  <!-- SETUP -->
  <section id="tab-setup" class="hide">
    <div class="card">
      <h2>1 · AI, който пише</h2>
      <label>Доставчик (безплатно — само вход, без API ключ)</label>
      <select id="ai_provider">
        <option value="antigravity">Antigravity (Google) — препоръчано, без ключ</option>
        <option value="gemini">Gemini — вход с Google (Google я спира скоро)</option>
        <option value="codex">ChatGPT (Codex) — вход с ChatGPT, вкл. безплатен план</option>
        <option value="openai">OpenAI — с API ключ (платено)</option>
      </select>
      <div id="cli-box">
        <div id="gemini-model-row">
          <label>Gemini модел</label>
          <input id="gemini_model"/>
        </div>
        <p class="hint" id="cli-hint" style="margin-top:10px"></p>
        <button class="btn ghost" onclick="loginAI()">Вход с акаунт (отваря браузър)</button>
        <button class="btn ghost" onclick="checkLogin()">Провери входа</button>
        <span id="ai-login-status" class="muted"></span>
      </div>
      <div id="openai-box" class="hide">
        <div class="row">
          <div><label>OpenAI модел</label><input id="openai_model"/></div>
          <div><label>OpenAI API ключ <span id="openai-have" class="muted"></span></label>
            <input id="openai_api_key" type="password" placeholder="(оставете празно за да запазите)"/></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>2 · Facebook страница</h2>
      <p class="hint">Поставете App ID и App Secret от вашето Meta приложение, после „Свържи“. Отваря се браузър за вход и избор на страница.</p>
      <div class="row">
        <div><label>App ID</label><input id="fb_app_id"/></div>
        <div><label>App Secret <span id="fb-have-secret" class="muted"></span></label>
          <input id="fb_app_secret" type="password" placeholder="(оставете празно за да запазите)"/></div>
      </div>
      <button class="btn" onclick="fbConnect()">Свържи Facebook</button>
      <span id="fb-status" class="muted"></span>
    </div>

    <div class="card">
      <h2>3 · График и поведение</h2>
      <div class="row">
        <div><label>Режим</label>
          <select id="schedule_mode">
            <option value="interval">През интервал</option>
            <option value="daily">Всеки ден в часове</option>
          </select></div>
        <div id="interval-box"><label>Интервал (минути)</label><input id="schedule_interval_minutes" type="number" min="1"/></div>
        <div id="times-box" class="hide"><label>Часове (HH:MM, със запетая)</label><input id="schedule_times" placeholder="09:00,18:00"/></div>
      </div>
      <div class="row">
        <div><label>Език на публикациите</label>
          <select id="post_language">
            <option value="Bulgarian">Български</option>
            <option value="English">English</option>
            <option value="German">Deutsch</option>
            <option value="Spanish">Español</option>
            <option value="French">Français</option>
            <option value="Italian">Italiano</option>
            <option value="Portuguese">Português</option>
            <option value="Dutch">Nederlands</option>
            <option value="Russian">Русский</option>
            <option value="Ukrainian">Українська</option>
            <option value="Turkish">Türkçe</option>
            <option value="Greek">Ελληνικά</option>
            <option value="Romanian">Română</option>
            <option value="Serbian">Српски</option>
            <option value="Polish">Polski</option>
            <option value="Arabic">العربية</option>
            <option value="__custom__">Друг (въведете) …</option>
          </select>
          <input id="post_language_custom" class="hide" style="margin-top:8px" placeholder="Език на английски, напр. Japanese"/></div>
        <div><label>Макс. дължина (символи)</label><input id="post_max_chars" type="number" min="50"/></div>
      </div>
      <div class="check"><input type="checkbox" id="run_on_start"/><label style="margin:0">Публикувай веднага при стартиране</label></div>
      <div class="check"><input type="checkbox" id="dry_run"/><label style="margin:0">Тестов режим (пише, но НЕ публикува)</label></div>
      <button class="btn ok" onclick="saveConfig()">Запази настройките</button>
    </div>
  </section>

  <!-- BUSINESS -->
  <section id="tab-business" class="hide">
    <div class="card">
      <h2>Профил на бизнеса</h2>
      <p class="hint">Кратък профил, за да звучат публикациите като вас.</p>
      <div id="business-fields"></div>
      <button class="btn ok" onclick="saveBusiness()">Запази профила</button>
    </div>
    <div class="card">
      <h2>Насочване на стила (само-коригиращо се)</h2>
      <p class="hint">Напишете какво да се промени — AI съгласува указанията в единен стил без противоречия.</p>
      <textarea id="feedback" placeholder="напр. по-кратко, повече емоджи, по-малко продажбено"></textarea>
      <button class="btn" onclick="sendFeedback()">Приложи</button>
      <label style="margin-top:16px">Текущ стил (steering.md)</label>
      <pre class="log" id="steering-view" style="max-height:30vh"></pre>
    </div>
  </section>

  <!-- POSTS -->
  <section id="tab-posts" class="hide">
    <div class="card">
      <h2>Публикации и изпълнения</h2>
      <p class="hint">Последните генерирания/публикувания с ангажираност.</p>
      <div style="overflow:auto"><table id="posts-table"><thead><tr>
        <th>Време</th><th>Статус</th><th>Текст</th><th>👍</th><th>💬</th><th>↗</th></tr></thead>
        <tbody id="posts-body"></tbody></table></div>
    </div>
  </section>

  <!-- LOGS -->
  <section id="tab-logs" class="hide">
    <div class="card">
      <h2>Дневник</h2>
      <p class="hint">Последните редове от logs/aipost247.log (опреснява се автоматично).</p>
      <pre class="log" id="log-view">…</pre>
    </div>
  </section>
</div>
<div class="toast" id="toast"></div>

<script>
var BIZ = [["name","Име на бизнеса / страницата"],["description","С какво се занимавате"],
  ["audience","Аудитория"],["tone","Тон и стил"],["topics","Теми за публикуване"],
  ["avoid","Какво да се избягва"],["cta","Подкана за действие"],["links","Връзки / профили"],
  ["notes","Друго, което AI трябва да знае"]];

function $(id){return document.getElementById(id);}
function toast(m){var t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(function(){t.classList.remove("show");},2200);}
function getJSON(u){return fetch(u).then(function(r){return r.json();});}
function postJSON(u,b){return fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})}).then(function(r){return r.json();});}

// tabs
document.querySelectorAll("nav button").forEach(function(b){
  b.addEventListener("click",function(){
    document.querySelectorAll("nav button").forEach(function(x){x.classList.remove("active");});
    b.classList.add("active");
    document.querySelectorAll("section").forEach(function(s){s.classList.add("hide");});
    $("tab-"+b.dataset.tab).classList.remove("hide");
    if(b.dataset.tab==="posts")loadPosts();
    if(b.dataset.tab==="logs")loadLogs();
    if(b.dataset.tab==="business")loadMemory();
  });
});

// build business fields
(function(){var c=$("business-fields");BIZ.forEach(function(f){
  c.insertAdjacentHTML("beforeend","<label>"+f[1]+"</label><textarea id=\"biz_"+f[0]+"\" rows=\"2\"></textarea>");});})();

function pill(label,ok){return '<span class="pill '+(ok?"ok":"bad")+'">'+(ok?"✓ ":"✕ ")+label+'</span>';}

function loadStatus(){
  getJSON("/api/status").then(function(s){
    $("pills").innerHTML = pill("AI",s.ai_ready)+pill("Facebook",s.facebook_connected)+
      '<span class="pill">'+s.schedule+'</span>'+
      '<span class="pill '+(s.autopilot.running?"ok":"")+'">'+(s.autopilot.running?"▶ автопилот":"❚❚ спрян")+'</span>';
    var st=s.stats;
    $("stats").innerHTML =
      stat(st.total,"Общо")+stat(st.published,"Публикувани")+stat(st.dry_run,"Тестови")+
      stat(st.failed,"Неуспешни")+stat(s.post_language,"Език");
    var ap=s.autopilot, box=$("autopilot-box");
    box.innerHTML = (ap.running
        ? '<button class="btn bad" onclick="autopilot(\'stop\')">Спри автопилота</button>'
        : '<button class="btn ok" onclick="autopilot(\'start\')">Старт на автопилота</button>')
      + ' <span class="muted">'+ (ap.running ? ("следващо: "+(ap.next_run_at||"скоро")) :
          (s.configured?"готов за стартиране":"завършете настройката")) +
        (ap.last_run_at? (" · последно: "+ap.last_run_at+" ("+(ap.last_result||"")+")"):"") +'</span>';
  });
}
function stat(n,l){return '<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>';}

function loadConfig(){
  getJSON("/api/config").then(function(c){
    $("ai_provider").value=c.ai_provider;
    $("gemini_model").value=c.gemini_model; $("openai_model").value=c.openai_model;
    $("openai-have").textContent=c.has_openai_key?"(зададен)":"";
    $("fb_app_id").value=c.fb_app_id||""; $("fb-have-secret").textContent=c.has_fb_app_secret?"(зададен)":"";
    $("schedule_mode").value=c.schedule_mode;
    $("schedule_interval_minutes").value=c.schedule_interval_minutes;
    $("schedule_times").value=c.schedule_times;
    setLang(c.post_language);
    $("post_max_chars").value=c.post_max_chars;
    $("run_on_start").checked=c.run_on_start; $("dry_run").checked=c.dry_run;
    $("fb-status").textContent=c.has_fb_token?("свързана страница: "+(c.fb_page_id||"")):"не е свързана";
    toggleProvider(); toggleSchedule();
  });
}
var CLI_HINTS={gemini:"Влезте с Google — безплатно, без API ключ.",
  antigravity:"Заместникът на Gemini CLI. Влезте с Google — без ключ. (Изисква инсталиран Antigravity CLI „agy“.)",
  codex:"Влезте с акаунт в ChatGPT (работи и с безплатния план) — без ключ. (Изисква Codex CLI.)"};
function toggleProvider(){var p=$("ai_provider").value,o=(p==="openai");
  $("openai-box").classList.toggle("hide",!o);$("cli-box").classList.toggle("hide",o);
  $("gemini-model-row").classList.toggle("hide",p!=="gemini");
  $("cli-hint").textContent=CLI_HINTS[p]||"";}
function toggleSchedule(){var d=$("schedule_mode").value==="daily";$("times-box").classList.toggle("hide",!d);$("interval-box").classList.toggle("hide",d);}
function toggleLang(){$("post_language_custom").classList.toggle("hide",$("post_language").value!=="__custom__");}
function getLang(){return $("post_language").value==="__custom__"?($("post_language_custom").value.trim()||"English"):$("post_language").value;}
function setLang(v){var sel=$("post_language");var opts=[].map.call(sel.options,function(o){return o.value;});
  if(v&&v!=="__custom__"&&opts.indexOf(v)>=0){sel.value=v;}
  else if(v){sel.value="__custom__";$("post_language_custom").value=v;}
  else{sel.value="Bulgarian";}
  toggleLang();}
$("ai_provider").addEventListener("change",toggleProvider);
$("schedule_mode").addEventListener("change",toggleSchedule);
$("post_language").addEventListener("change",toggleLang);

function saveConfig(){
  var b={ai_provider:$("ai_provider").value,gemini_model:$("gemini_model").value,
    openai_model:$("openai_model").value,openai_api_key:$("openai_api_key").value,
    schedule_mode:$("schedule_mode").value,
    schedule_interval_minutes:parseInt($("schedule_interval_minutes").value||"120",10),
    schedule_times:$("schedule_times").value,post_language:getLang(),
    post_max_chars:parseInt($("post_max_chars").value||"600",10),
    run_on_start:$("run_on_start").checked,dry_run:$("dry_run").checked};
  postJSON("/api/config",b).then(function(r){toast(r.ok?"Запазено":"Грешка");$("openai_api_key").value="";loadConfig();loadStatus();});
}
function checkLogin(){$("ai-login-status").textContent="проверявам…";
  postJSON("/api/check-login",{}).then(function(r){$("ai-login-status").textContent=r.logged_in?"✓ влязъл":"✕ още не сте влезли";loadStatus();});}
function loginAI(){var p=$("ai_provider").value;$("ai-login-status").textContent="влизане…";
  postJSON("/api/login-gemini",{provider:p}).then(function(r){
    if(r.already){$("ai-login-status").textContent="✓ вече сте влезли";}
    else if(r.message){$("ai-login-status").innerHTML="↪ "+r.message;toast("Вижте прозореца на терминала");}
    else if(r.error){$("ai-login-status").textContent="✕ "+r.error;}
    else{$("ai-login-status").textContent=r.logged_in?"✓ влязъл":"…";}
    loadStatus();});}
function fbConnect(){toast("Отваря се браузър за Facebook…");$("fb-status").textContent="свързване…";
  postJSON("/api/facebook/connect",{fb_app_id:$("fb_app_id").value,fb_app_secret:$("fb_app_secret").value}).then(function(r){
    $("fb-status").textContent=r.ok?("✓ "+r.page_name+" ("+r.page_id+")"):("✕ "+(r.error||"неуспех"));
    $("fb_app_secret").value="";loadStatus();});}

function showActionResult(r,o){
  if(r&&r.ok){o.textContent=(r.text!==undefined?r.text:("Готово · обновени: "+(r.updated!==undefined?r.updated:"")))+(r.published?"\n\n✓ Публикувано (id "+r.post_id+")":(r.published===false?"\n\n(тестов преглед — не е публикувано)":""));}
  else{o.textContent="✕ "+((r&&r.error)||"Грешка");}
}
function act(url,msg){toast(msg);var o=$("action-out");o.classList.remove("hide");o.textContent=msg+" (може да отнеме до минута) …";
  postJSON(url,{}).then(function(r){
    if(r&&r.job){
      var t=setInterval(function(){
        getJSON("/api/job?id="+r.job).then(function(j){
          if(j&&j.status==="done"){clearInterval(t);showActionResult(j.result,o);loadStatus();}
        }).catch(function(){});
      },1500);
    } else { showActionResult(r,o); loadStatus(); }
  }).catch(function(){o.textContent="✕ Грешка при заявката";});
}

function autopilot(a){postJSON("/api/autopilot",{action:a}).then(function(r){if(!r.ok)toast(r.error||"Грешка");loadStatus();});}

function loadPosts(){getJSON("/api/posts").then(function(d){
  $("posts-body").innerHTML=d.posts.map(function(p){
    var txt=(p.content||"").replace(/</g,"&lt;");if(txt.length>120)txt=txt.slice(0,120)+"…";
    return "<tr><td>"+(p.created_at||"")+"</td><td><span class=\"tag "+p.status+"\">"+p.status+"</span></td>"+
      "<td>"+txt+"</td><td>"+(p.likes||0)+"</td><td>"+(p.comments||0)+"</td><td>"+(p.shares||0)+"</td></tr>";
  }).join("")||"<tr><td colspan=6 class=muted>Все още няма публикации.</td></tr>";});}
function loadLogs(){getJSON("/api/logs").then(function(d){var v=$("log-view");v.textContent=d.log;v.scrollTop=v.scrollHeight;});}
function loadMemory(){getJSON("/api/memory").then(function(m){
  $("steering-view").textContent=m.steering||"(още няма)";
  BIZ.forEach(function(f){ /* keep what's typed; only prefill empties from saved md is complex — leave editable */ });});}

function saveBusiness(){var b={};BIZ.forEach(function(f){b[f[0]]=$("biz_"+f[0]).value;});
  postJSON("/api/business",b).then(function(r){toast(r.ok?"Профилът е запазен":(r.error||"Грешка"));});}
function sendFeedback(){var t=$("feedback").value.trim();if(!t){toast("Напишете нещо");return;}toast("Съгласувам стила…");
  postJSON("/api/feedback",{feedback:t}).then(function(r){if(r.ok){$("feedback").value="";$("steering-view").textContent=r.steering;toast("Стилът е обновен");}else toast(r.error||"Грешка");});}

loadStatus();loadConfig();
setInterval(function(){loadStatus();var l=$("tab-logs");if(l&&!l.classList.contains("hide"))loadLogs();var p=$("tab-posts");if(p&&!p.classList.contains("hide"))loadPosts();},5000);

// ---- Guided tour (first visit + „? Обиколка") ----
(function(){
  var KEY="aipost247_tour_v1";
  var steps=[
    {title:"Добре дошли! 👋",text:"Това е таблото на AIPost247 — настройка и наблюдение без терминал. Ще ви преведа за по-малко от минута."},
    {tab:"setup",sel:"#cli-box",title:"1 · AI, който пише",text:"Започнете оттук: изберете безплатен доставчик (Gemini, Antigravity или ChatGPT) и натиснете „Вход с акаунт“ — без API ключ."},
    {tab:"setup",sel:"#fb_app_id",title:"2 · Facebook",text:"Поставете App ID и App Secret от вашето Meta приложение, после „Свържи Facebook“ и одобрете в браузъра."},
    {tab:"setup",sel:"#schedule_mode",title:"3 · График и език",text:"Изберете на колко време да публикува и на какъв език, после „Запази настройките“."},
    {tab:"business",sel:"#business-fields",title:"4 · Бизнес и стил",text:"Опишете бизнеса си — така публикациите звучат като вас. По-късно може да насочвате стила с обратна връзка."},
    {tab:"overview",sel:"#autopilot-box",title:"5 · Старт на автопилота",text:"Накрая натиснете „Старт на автопилота“ — таблото започва да генерира и публикува по графика."},
    {tab:"overview",sel:"#action-out",title:"Бързи действия",text:"„Генерирай (преглед)“ показва публикация без да я публикува. „Публикувай сега“ пуска една веднага."},
    {tab:"posts",sel:"#posts-table",title:"Наблюдение",text:"В „Публикации“ виждате историята и ангажираността; в „Дневник“ — какво прави програмата на живо."},
    {tab:"overview",sel:null,title:"Готови сте! 🎉",text:"Започнете от раздел „Настройка“. Може да върнете тази обиколка по всяко време с бутона „? Обиколка“ горе."}
  ];
  var i=0,dim=null,spot=null,card=null;
  function build(){
    dim=document.createElement("div");dim.className="tour-dim";
    spot=document.createElement("div");spot.className="tour-spot";
    card=document.createElement("div");card.className="tour-card";
    document.body.appendChild(dim);document.body.appendChild(spot);document.body.appendChild(card);
  }
  function go(tab){var b=[].slice.call(document.querySelectorAll("nav button")).filter(function(x){return x.dataset.tab===tab;})[0];if(b)b.click();}
  function placeCard(r){
    var cw=Math.min(330,window.innerWidth-32),ch=card.offsetHeight||160;
    if(!r){card.style.left=Math.round((window.innerWidth-cw)/2)+"px";card.style.top=Math.round((window.innerHeight-ch)/2)+"px";return;}
    var below=r.bottom+12,above=r.top-ch-12;
    var top=(below+ch<window.innerHeight)?below:(above>10?above:Math.max(10,window.innerHeight-ch-10));
    var left=Math.min(Math.max(10,r.left),window.innerWidth-cw-10);
    card.style.left=left+"px";card.style.top=top+"px";
  }
  function renderCard(){
    var s=steps[i];
    card.innerHTML="<h4>"+s.title+"</h4><p>"+s.text+"</p><div class=\"tnav\"><span class=\"step-n\">"+(i+1)+" / "+steps.length+
      "</span><span>"+(i>0?"<button class=\"prev\">Назад</button>":"")+
      "<button class=\"skip\">Прескочи</button><button class=\"next\">"+(i===steps.length-1?"Готово":"Напред")+"</button></span></div>";
    card.querySelector(".next").onclick=function(){if(i===steps.length-1)finish();else{i++;show();}};
    card.querySelector(".skip").onclick=finish;
    var pv=card.querySelector(".prev");if(pv)pv.onclick=function(){i--;show();};
  }
  function show(){
    var s=steps[i];
    if(s.tab)go(s.tab);
    setTimeout(function(){
      renderCard();
      var el=s.sel?document.querySelector(s.sel):null;
      if(el){
        el.scrollIntoView({block:"center",behavior:"smooth"});
        setTimeout(function(){
          var r=el.getBoundingClientRect(),pad=8;
          spot.style.display="block";
          spot.style.left=(r.left-pad)+"px";spot.style.top=(r.top-pad)+"px";
          spot.style.width=(r.width+pad*2)+"px";spot.style.height=(r.height+pad*2)+"px";
          placeCard(r);
        },360);
      }else{
        spot.style.display="none";placeCard(null);
      }
    },s.tab?260:20);
  }
  function finish(){try{localStorage.setItem(KEY,"1");}catch(e){}
    [dim,spot,card].forEach(function(n){if(n&&n.parentNode)n.parentNode.removeChild(n);});dim=spot=card=null;}
  window.startTour=function(){if(dim)finish();build();i=0;show();};
  document.getElementById("help-btn").onclick=window.startTour;
  var seen=false;try{seen=!!localStorage.getItem(KEY);}catch(e){}
  if(!seen)setTimeout(window.startTour,800);
})();
</script>
</body></html>"""
