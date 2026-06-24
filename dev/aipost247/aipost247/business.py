"""'Train your business' — capture a business profile used to prompt the AI.

Opens a form to enter your business details, then saves them as a skill at
``memory/business.md``. That file is blended into the prompt by
``MemoryStore.build_context()`` every time a post is generated.

The form is shown, in order of preference:
  1. a native desktop window (tkinter), when available;
  2. a professional form in your web browser (works everywhere — no extra
     dependencies, since everyone has a browser);
  3. a plain terminal questionnaire, as a last resort.
"""
from __future__ import annotations

import html as _html
import http.server
import time
import urllib.parse
import webbrowser
from pathlib import Path

from .logging_setup import get_logger

log = get_logger("business")

# (key, label, multiline?)
FIELDS = [
    ("name", "Име на бизнеса / страницата", False),
    ("description", "С какво се занимавате (продукти / услуги)", True),
    ("audience", "Каква е вашата аудитория?", False),
    ("tone", "Тон и стил", False),
    ("topics", "Теми за публикуване", True),
    ("avoid", "Какво да се избягва", False),
    ("cta", "Обичайна подкана за действие", False),
    ("links", "Уебсайт / връзки / профили", False),
    ("notes", "Друго, което AI трябва да знае", True),
]

_HINTS = {
    "name": "напр. „Кафене Joe's“",
    "description": "Какво продавате или предлагате, в едно-две изречения.",
    "audience": "Към кого се обръщате — напр. любители на кафе, заети родители.",
    "tone": "Как да звучат публикациите — приятелски, професионално, забавно…",
    "topics": "За какво да публикувате — съвети, оферти, зад кулисите…",
    "avoid": "Какво е забранено — политика, конкуренти, агресивна продажба…",
    "cta": "Какво да направят читателите — да посетят сайта, да коментират, да пишат…",
    "links": "Уебсайт, Instagram профил и т.н.",
    "notes": "Промоции, важни факти, друго полезно.",
}

_PRETTY = {
    "name": "Бизнес",
    "description": "С какво се занимаваме",
    "audience": "Аудитория",
    "tone": "Тон и стил",
    "topics": "Теми за публикуване",
    "avoid": "Избягвай",
    "cta": "Подкана за действие",
    "links": "Връзки / профили",
}
_PRETTY_TO_KEY = {value: key for key, value in _PRETTY.items()}


class GuiUnavailable(Exception):
    """No desktop GUI (tkinter missing or no display)."""


def _collect_via_gui(prefill: dict) -> dict | None:
    try:
        import tkinter as tk
    except Exception as exc:  # noqa: BLE001 - tkinter may be absent
        raise GuiUnavailable from exc
    try:
        root = tk.Tk()
    except Exception as exc:  # headless / no display
        raise GuiUnavailable from exc

    bg, card, ink, muted, accent, accent_dark = (
        "#f4f6fb", "#ffffff", "#16202c", "#6b7a8d", "#1877f2", "#0b5fd0",
    )
    result: dict = {"data": None}
    widgets: dict = {}

    root.title("AIPost247 — Профил на бизнеса")
    root.geometry("620x720")
    root.minsize(520, 520)
    root.configure(bg=bg)

    # Header bar
    head = tk.Frame(root, bg=accent)
    head.pack(fill="x")
    tk.Label(head, text="Разкажете на AI за бизнеса си", bg=accent, fg="white",
             font=("Helvetica", 15, "bold")).pack(anchor="w", padx=18, pady=(14, 0))
    tk.Label(head, text="Ползва се като контекст при всяка публикация. Всички полета са по избор.",
             bg=accent, fg="#dbe9ff", font=("Helvetica", 10)).pack(anchor="w", padx=18, pady=(2, 14))

    # Scrollable body
    body = tk.Frame(root, bg=bg)
    body.pack(fill="both", expand=True)
    canvas = tk.Canvas(body, bg=bg, highlightthickness=0)
    scrollbar = tk.Scrollbar(body, orient="vertical", command=canvas.yview)
    form = tk.Frame(canvas, bg=bg)
    form_id = canvas.create_window((0, 0), window=form, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)
    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")
    form.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
    canvas.bind("<Configure>", lambda e: canvas.itemconfig(form_id, width=e.width))
    canvas.bind_all("<MouseWheel>",
                    lambda e: canvas.yview_scroll(-1 if getattr(e, "delta", 0) > 0 else 1, "units"))

    for key, label, multiline in FIELDS:
        block = tk.Frame(form, bg=bg)
        block.pack(fill="x", padx=18, pady=(12, 0))
        tk.Label(block, text=label, bg=bg, fg=ink, anchor="w",
                 font=("Helvetica", 11, "bold")).pack(fill="x")
        if _HINTS.get(key):
            tk.Label(block, text=_HINTS[key], bg=bg, fg=muted, anchor="w",
                     font=("Helvetica", 9)).pack(fill="x")
        if multiline:
            widget = tk.Text(block, height=3, wrap="word", relief="solid", bd=1, highlightthickness=0)
            widget.insert("1.0", prefill.get(key, ""))
        else:
            widget = tk.Entry(block, relief="solid", bd=1, highlightthickness=0)
            widget.insert(0, prefill.get(key, ""))
        widget.pack(fill="x", pady=(4, 0), ipady=4)
        widgets[key] = (widget, multiline)

    def on_save():
        result["data"] = {
            key: (w.get("1.0", "end") if multiline else w.get()).strip()
            for key, (w, multiline) in widgets.items()
        }
        root.destroy()

    def on_skip():
        result["data"] = None
        root.destroy()

    # Footer buttons (tk.Label honours colours on every OS, unlike tk.Button on macOS)
    footer = tk.Frame(root, bg=bg)
    footer.pack(fill="x", padx=18, pady=14)

    def _button(parent, text, command, primary=False):
        widget = tk.Label(
            parent, text=text, cursor="hand2",
            bg=(accent if primary else "#e6ebf4"), fg=("white" if primary else ink),
            font=("Helvetica", 11, "bold" if primary else "normal"), padx=20, pady=10,
        )
        widget.bind("<Button-1>", lambda _e: command())
        if primary:
            widget.bind("<Enter>", lambda _e: widget.configure(bg=accent_dark))
            widget.bind("<Leave>", lambda _e: widget.configure(bg=accent))
        return widget

    _button(footer, "Запази профила", on_save, primary=True).pack(side="right")
    _button(footer, "Прескочи", on_skip).pack(side="right", padx=(0, 10))

    root.bind("<Escape>", lambda _e: on_skip())
    root.update_idletasks()
    try:
        root.eval("tk::PlaceWindow . center")
    except Exception:  # noqa: BLE001
        pass
    root.lift()
    root.attributes("-topmost", True)
    root.after(400, lambda: root.attributes("-topmost", False))
    root.mainloop()
    return result["data"]


_BROWSER_PORTS = (8724, 8725, 8726, 8731)


def _render_form_html(prefill: dict) -> str:
    """A self-contained, professional form page (Facebook-blue, on-brand)."""
    rows = []
    for key, label, multiline in FIELDS:
        hint = _HINTS.get(key, "")
        value = _html.escape(prefill.get(key, "") or "")
        hint_html = f'<p class="hint">{_html.escape(hint)}</p>' if hint else ""
        if multiline:
            field = f'<textarea name="{key}" rows="3">{value}</textarea>'
        else:
            field = f'<input type="text" name="{key}" value="{value}" />'
        rows.append(
            f'<div class="field"><label>{_html.escape(label)}</label>{hint_html}{field}</div>'
        )
    fields_html = "\n".join(rows)
    return f"""<!DOCTYPE html>
<html lang="bg"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AIPost247 — Профил на бизнеса</title>
<style>
  :root {{ --accent:#1877f2; --accent-ink:#0b5fd0; --ink:#16202c; --muted:#5b6b7e;
           --line:#e2e8f2; --bg:#f4f6fb; --card:#fff; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
          font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }}
  .wrap {{ max-width:680px; margin:0 auto; padding:28px 18px 60px; }}
  .head {{ background:linear-gradient(135deg,#1877f2,#0b5fd0); color:#fff;
           border-radius:14px; padding:22px 24px; box-shadow:0 16px 38px -22px rgba(24,119,242,.7); }}
  .head h1 {{ margin:0 0 6px; font-size:1.4rem; }}
  .head p {{ margin:0; opacity:.95; font-size:.94rem; }}
  form {{ background:var(--card); border:1px solid var(--line); border-radius:14px;
          padding:22px 24px; margin-top:18px; box-shadow:0 12px 30px -22px rgba(16,32,44,.45); }}
  .field {{ margin-bottom:16px; }}
  label {{ display:block; font-weight:700; margin-bottom:3px; }}
  .hint {{ margin:0 0 6px; color:var(--muted); font-size:.84rem; }}
  input, textarea {{ width:100%; padding:10px 12px; border:1px solid var(--line);
           border-radius:9px; font:inherit; color:var(--ink); background:#fff; resize:vertical; }}
  input:focus, textarea:focus {{ outline:none; border-color:var(--accent);
           box-shadow:0 0 0 3px rgba(24,119,242,.15); }}
  .actions {{ display:flex; gap:12px; justify-content:flex-end; margin-top:8px; }}
  button {{ font:inherit; font-weight:700; border:none; border-radius:10px;
            padding:12px 22px; cursor:pointer; }}
  .save {{ background:var(--accent); color:#fff; }}
  .save:hover {{ background:var(--accent-ink); }}
  .skip {{ background:#e6ebf4; color:var(--ink); }}
</style></head>
<body><div class="wrap">
  <div class="head">
    <h1>Разкажете на AI за бизнеса си</h1>
    <p>Ползва се като контекст при всяка публикация. Всички полета са по избор.</p>
  </div>
  <form method="POST" action="/">
    {fields_html}
    <div class="actions">
      <button type="submit" name="__action" value="skip" class="skip">Прескочи</button>
      <button type="submit" name="__action" value="save" class="save">Запази профила</button>
    </div>
  </form>
</div></body></html>"""


def _done_html(saved: bool) -> str:
    msg = ("Профилът е запазен! Върнете се в терминала — може да затворите този раздел."
           if saved else "Прескочено. Може да затворите този раздел.")
    return ("<!DOCTYPE html><html lang='bg'><head><meta charset='UTF-8'></head>"
            "<body style='font-family:sans-serif;text-align:center;margin-top:16%'>"
            f"<h2 style='color:#1877f2'>AIPost247</h2><p>{msg}</p></body></html>")


def _collect_via_browser(prefill: dict, timeout: int = 600) -> dict | None:
    """Serve a one-page form on localhost, open it, and capture the submission."""
    state: dict = {"data": None, "done": False, "saved": False}
    page = _render_form_html(prefill)

    class Handler(http.server.BaseHTTPRequestHandler):
        def _send(self, body: str):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))

        def do_GET(self):  # noqa: N802
            self._send(page)

        def do_POST(self):  # noqa: N802
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length).decode("utf-8") if length else ""
            params = urllib.parse.parse_qs(raw, keep_blank_values=True)
            saved = params.get("__action", ["save"])[0] != "skip"
            if saved:
                state["data"] = {
                    key: (params.get(key, [""])[0] or "").strip()
                    for key, _label, _multiline in FIELDS
                }
            state["saved"] = saved
            state["done"] = True
            self._send(_done_html(saved))

        def log_message(self, *_args):  # silence default logging
            return

    server = None
    for port in _BROWSER_PORTS:
        try:
            server = http.server.HTTPServer(("localhost", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        raise GuiUnavailable("no free local port for the form")

    server.timeout = 1
    url = f"http://localhost:{server.server_port}/"
    opened = False
    try:
        opened = webbrowser.open(url)
    except Exception:  # noqa: BLE001
        opened = False
    if not opened:
        server.server_close()
        raise GuiUnavailable("no web browser available")

    print(f"  Отворих формата в браузъра: {url}")
    print("  Попълнете я там и натиснете „Запази профила“. (Ако не се отвори,")
    print(f"  поставете адреса в браузъра ръчно: {url})")
    deadline = time.time() + timeout
    try:
        while not state["done"] and time.time() < deadline:
            server.handle_request()
    finally:
        server.server_close()

    if not state["done"]:
        print("  Времето за формата изтече — нищо не е променено.")
        return None
    return state["data"]


def _collect_via_terminal(prefill: dict) -> dict:
    print("\n  Разкажете на AI за бизнеса си (Enter за да прескочите поле):")
    data = {}
    for key, label, _multiline in FIELDS:
        current = prefill.get(key, "")
        hint = _HINTS.get(key, "")
        if hint:
            print(f"    · {hint}")
        suffix = f" [{current}]" if current else ""
        data[key] = input(f"    {label}{suffix}: ").strip() or current
    return data


def render_markdown(data: dict) -> str:
    lines = ["# Профил на бизнеса (AIPost247 умение)", ""]
    for key in ("name", "description", "audience", "tone", "topics", "avoid", "cta", "links"):
        value = (data.get(key) or "").strip()
        if value:
            lines.append(f"**{_PRETTY[key]}:** {value}")
    notes = (data.get("notes") or "").strip()
    if notes:
        lines += ["", notes]
    return "\n".join(lines).strip() + "\n"


def parse_markdown(text: str) -> dict[str, str]:
    """Read the generated business.md back into editable dashboard fields."""
    result = {key: "" for key, _label, _multiline in FIELDS}
    notes: list[str] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("**") and ":**" in line:
            label, value = line[2:].split(":**", 1)
            key = _PRETTY_TO_KEY.get(label.strip())
            if key:
                result[key] = value.strip()
                continue
        notes.append(line)
    result["notes"] = "\n".join(notes).strip()
    return result


def load_profile(memory_dir) -> dict[str, str]:
    path = Path(memory_dir) / "business.md"
    try:
        return parse_markdown(path.read_text(encoding="utf-8"))
    except OSError:
        return {key: "" for key, _label, _multiline in FIELDS}


def save_profile(memory_dir, data: dict) -> Path:
    path = Path(memory_dir) / "business.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(data), encoding="utf-8")
    return path


def run_training(memory_dir, prefill: dict | None = None) -> bool:
    """Show the form (native window → browser → terminal) and save the profile."""
    prefill = prefill or {}

    data = None
    for collector in (_collect_via_gui, _collect_via_browser):
        try:
            data = collector(prefill)
            break
        except GuiUnavailable:
            continue
    else:
        print("  (Няма наличен прозорец или браузър — използваме текстова форма.)")
        data = _collect_via_terminal(prefill)

    if data is None:
        print("  Прескочено — бизнес профилът е непроменен.")
        return False
    if not any((data.get(key) or "").strip() for key, _label, _multiline in FIELDS):
        print("  Нищо не е въведено — прескочено.")
        return False

    path = save_profile(memory_dir, data)
    print(f"  ✓ Бизнес профилът е запазен в {path}")
    return True
