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
    ("name", "Business / Page name", False),
    ("description", "What you do (products / services)", True),
    ("audience", "Who is your audience?", False),
    ("tone", "Tone & style (e.g. friendly, professional, witty)", False),
    ("topics", "Topics to post about", True),
    ("avoid", "Things to avoid", False),
    ("cta", "Usual call to action (visit site, comment, DM…)", False),
    ("links", "Website / links / handles", False),
    ("notes", "Anything else the AI should know", True),
]

_PRETTY = {
    "name": "Business",
    "description": "What we do",
    "audience": "Audience",
    "tone": "Tone & style",
    "topics": "Topics to post about",
    "avoid": "Avoid",
    "cta": "Call to action",
    "links": "Links / handles",
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

    root.title("AIPost247 — Train your business")
    root.geometry("560x680")
    result: dict = {"data": None}
    widgets: dict = {}

    tk.Label(root, text="Tell the AI about your business",
             font=("Helvetica", 15, "bold")).pack(pady=(14, 2))
    tk.Label(root, text="Used as context every time it writes a Facebook post.",
             fg="#555").pack(pady=(0, 8))

    form = tk.Frame(root)
    form.pack(fill="both", expand=True, padx=16)

    for key, label, multiline in FIELDS:
        tk.Label(form, text=label, anchor="w",
                 font=("Helvetica", 10, "bold")).pack(fill="x", pady=(8, 0))
        if multiline:
            widget = tk.Text(form, height=3, wrap="word")
            widget.insert("1.0", prefill.get(key, ""))
        else:
            widget = tk.Entry(form)
            widget.insert(0, prefill.get(key, ""))
        widget.pack(fill="x")
        widgets[key] = (widget, multiline)

    def on_save():
        result["data"] = {
            key: (w.get("1.0", "end") if multiline else w.get()).strip()
            for key, (w, multiline) in widgets.items()
        }
        root.destroy()

    def on_cancel():
        result["data"] = None
        root.destroy()

    buttons = tk.Frame(root)
    buttons.pack(pady=12)
    tk.Button(buttons, text="Save", width=12, command=on_save).pack(side="left", padx=6)
    tk.Button(buttons, text="Cancel", width=12, command=on_cancel).pack(side="left", padx=6)
    root.bind("<Escape>", lambda _event: on_cancel())

    try:
        root.eval("tk::PlaceWindow . center")
    except Exception:  # noqa: BLE001
        pass
    root.lift()
    root.attributes("-topmost", True)
    root.after(300, lambda: root.attributes("-topmost", False))
    root.mainloop()
    return result["data"]


def _collect_via_terminal(prefill: dict) -> dict:
    print("\n  Tell the AI about your business (press Enter to skip a field):")
    data = {}
    for key, label, _multiline in FIELDS:
        current = prefill.get(key, "")
        suffix = f" [{current}]" if current else ""
        data[key] = input(f"    {label}{suffix}: ").strip() or current
    return data


def render_markdown(data: dict) -> str:
    lines = ["# Business profile (AIPost247 skill)", ""]
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
        print("  (No desktop window available — using a quick text form instead.)")
        data = _collect_via_terminal(prefill)

    if data is None:
        print("  Cancelled — business profile unchanged.")
        return False
    if not any((data.get(key) or "").strip() for key, _label, _multiline in FIELDS):
        print("  Nothing entered — skipped.")
        return False

    path = save_profile(memory_dir, data)
    print(f"  Saved your business profile to {path}")
    return True
