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
    ("tone", "Tone & style", False),
    ("topics", "Topics to post about", True),
    ("avoid", "Things to avoid", False),
    ("cta", "Usual call to action", False),
    ("links", "Website / links / handles", False),
    ("notes", "Anything else the AI should know", True),
]

_HINTS = {
    "name": "e.g. Joe's Coffee Roasters",
    "description": "What you sell or offer, in a sentence or two.",
    "audience": "Who you're talking to — e.g. home brewers, busy parents.",
    "tone": "How posts should feel — friendly, professional, witty, bold…",
    "topics": "What to post about — tips, offers, behind-the-scenes…",
    "avoid": "Anything off-limits — politics, competitors, hard selling…",
    "cta": "What readers should do — visit site, comment, message us…",
    "links": "Website, Instagram handle, etc.",
    "notes": "Promotions, key facts, anything else useful.",
}

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

    bg, card, ink, muted, accent, accent_dark = (
        "#f4f6fb", "#ffffff", "#16202c", "#6b7a8d", "#1877f2", "#0b5fd0",
    )
    result: dict = {"data": None}
    widgets: dict = {}

    root.title("AIPost247 — Train your business")
    root.geometry("620x720")
    root.minsize(520, 520)
    root.configure(bg=bg)

    # Header bar
    head = tk.Frame(root, bg=accent)
    head.pack(fill="x")
    tk.Label(head, text="Tell the AI about your business", bg=accent, fg="white",
             font=("Helvetica", 15, "bold")).pack(anchor="w", padx=18, pady=(14, 0))
    tk.Label(head, text="Used as context every time it writes a post. Every field is optional.",
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

    _button(footer, "Save profile", on_save, primary=True).pack(side="right")
    _button(footer, "Skip for now", on_skip).pack(side="right", padx=(0, 10))

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
    print("\n  Tell the AI about your business (press Enter to skip a field):")
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
        print("  Skipped — business profile unchanged.")
        return False
    if not any((data.get(key) or "").strip() for key, _label, _multiline in FIELDS):
        print("  Nothing entered — skipped.")
        return False

    path = save_profile(memory_dir, data)
    print(f"  ✓ Saved your business profile to {path}")
    return True
