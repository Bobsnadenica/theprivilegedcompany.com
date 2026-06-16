"""'Train your business' — capture a business profile used to prompt the AI.

Opens a small desktop popup (tkinter) to enter your business details, then saves
them as a skill at ``memory/business.md``. That file is blended into the prompt
by ``MemoryStore.build_context()`` every time a post is generated. If no desktop
GUI is available, it falls back to a terminal questionnaire.
"""
from __future__ import annotations

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


def save_profile(memory_dir, data: dict) -> Path:
    path = Path(memory_dir) / "business.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_markdown(data), encoding="utf-8")
    return path


def run_training(memory_dir, prefill: dict | None = None) -> bool:
    """Show the popup (or terminal fallback) and save the business profile."""
    prefill = prefill or {}
    try:
        data = _collect_via_gui(prefill)
    except GuiUnavailable:
        print("  (Няма наличен прозорец — използваме бърза текстова форма.)")
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
