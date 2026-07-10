# AIPost247 — Robustness & Usability Improvement Plan

**Drafted:** 2026-06-18 · **Updated:** 2026-07-10 · **Status:** IN PROGRESS
**Guiding rule:** every change is **additive and behind the existing abstractions**, landed with
a test that locks the behaviour in — so we improve *without breaking what already works*.

---

## Where the project is today (honest snapshot)
Working well: the web dashboard (config + monitor), the self-correcting steering, the
multi-instance port auto-select, the Bulgarian guide with the `how_to.txt` caption gallery + video
section, the Facebook OAuth + posting, Gemini generation, packaging with a secret-leak safety net.

The fragile parts (what this plan targets):
1. **Generation reliability** — `gemini`/`agy`/`codex` are *agentic coding* CLIs; only Gemini's
   `-p` behaved like a clean text completion. **Antigravity currently fails** (returns "I need a
   brief…"), and Gemini is being retired (2026-06-18). This is the #1 risk to the core value.
2. **Login reliability** — driving an interactive terminal OAuth (paste-the-code) from a web button
   is fragile: `invalid_grant` (code expiry) and hangs.
3. **Test coverage is still selective** — the standard-library suite now covers core safety,
   provider isolation, coordination, output validation, and distribution invariants, and is
   exposed through `run.sh test` / `run.bat test`; endpoint and config round-trip coverage can grow.
4. **Packaging drift** — the release has a size bound and now excludes bytecode plus test/coverage
   caches, but the bundled offline guide media remains the largest part of the archive.

---

## P0 — Make content generation actually reliable (the core value)

| # | Item | Why | Effort |
|---|---|---|---|
| P0-1 | **Confirm each CLI's real one-shot contract** (the spike). On a machine with `agy`/`codex`: capture `--help`, the exact non-interactive flags (e.g. `--yolo`/`--yes`/`--output-format`), the login subcommand, and where creds live. Bake into the `PROVIDERS` spec. The new **"Тест на доставчика"** button already surfaces raw output to drive this. | Antigravity is the default and it's broken; can't guess the agentic CLI's interface. | 2h |
| P0-2 | **Output validation + retry.** After generation, reject obvious non-posts (refusals, "I need a brief", empty, agentic chatter, way-too-long) and retry once with a stricter prompt; if still bad, surface a clear error instead of saving garbage as a post. | Today a confused model reply gets saved as a "post". | 2h |
| P0-3 | **Add a non-agentic reliable provider for people who want it to *just work*:** (a) **Ollama** (local, free, clean completion, no account) and/or (b) direct **Gemini/OpenAI API** (key-based). Keep the free login-CLIs as options, but stop betting the whole product on agentic CLIs. | A coding-agent CLI is the wrong tool for "write a 600-char post"; a plain completion endpoint is reliable. | 3h |
| P0-4 | **Provider self-test in setup + dashboard:** one click runs a tiny real generation and shows ✓/✗ with the raw output, so users (and we) know a provider works *before* relying on it. | Turns silent failures into obvious, fixable ones. | 1h (button exists; wire into setup) |

> Overlaps with `planning/sprint-antigravity-migration.md` (P2-1/P2-3). Treat that as the provider
> half; this plan adds validation + a non-agentic fallback.

## P1 — De-fragilize login & add a safety net

| # | Item | Why | Effort |
|---|---|---|---|
| P1-1 | **Login lives in the terminal; dashboard only detects it.** Finish the move: the dashboard button explains "finish in the terminal", a clean foreground `provider login` runs there, and the **"Провери входа"** probe (already added) confirms it — including keyring creds. Stop trying to drive the paste-the-code flow from the browser. | `invalid_grant`/hangs come from web-driven interactive OAuth. | 2h |
| P1-2 | **Automated test suite + a `run.sh test` / `run.bat test` command.** **Partially complete:** the standard-library tests cover the highest-risk paths and the launcher now exposes them. Add endpoint smoke, config persistence, and broader distribution assertions incrementally. | The suite catches provider, coordination, dashboard security, manifest, and Windows launcher regressions. | 4h |
| P1-3 | **Packaging hygiene.** Exclude website-only assets (`assets/*.jpg`, `__pycache__`, `video/`) from the **user** zip — those are for the site gallery, not the downloadable tool. Keep the download lean (~90 KB). Add the size guard from P1-2. | The download ballooned 86 KB → 2.5 MB after the asset reorg. | 1h |

## P2 — Usability polish

| # | Item | Why | Effort |
|---|---|---|---|
| P2-1 | **Smart provider picker.** In the dashboard, show each provider's state (installed? logged in? last self-test result) and recommend the one that actually works; de-emphasize broken/unverified ones. | Users shouldn't have to guess between 4 providers, one of which is broken. | 2h |
| P2-2 | **Instance label.** Optional name shown in the dashboard header + browser tab title, so several open dashboards (multi-page setup) are distinguishable at a glance. | Multi-instance is supported but indistinguishable. | 1h |
| P2-3 | **Clearer failure reporting.** A small "Защо спря?" panel summarising the last error (auth / rate-limit / generation / Facebook) with the one fix to try — instead of digging in the log. | Turn cryptic states into actionable next steps. | 1.5h |
| P2-4 | **Autopilot resilience.** On repeated failures, pause autopilot + show a clear notice (don't silently burn cycles); persist autopilot on/off across restarts. | Today a broken provider just keeps failing each cycle. | 2h |

## P3 — Maintainability (do opportunistically)

- Split the dashboard's one big embedded HTML/CSS/JS string into separate files served by the
  handler — easier to edit and review (it's now ~1k lines inline).
- A small `release.py` that bumps `__version__`, stamps the date, rebuilds, and runs the test suite
  — so releases can't ship a broken zip.
- Resolve the stray `download/aipost247/` extracted copy (gitignore it; document "extract a fresh
  copy outside the repo to run"). Running from inside `download/` causes the stale-code confusion
  seen during debugging.

---

## Suggested order (each ships independently; nothing forces a big-bang change)
1. **P1-3 packaging hygiene** (fast, removes the 2.5 MB regression) + **P1-2 test guards** (locks it).
2. **P0-1 spike** → **P0-2 validation** → **P0-4 self-test** (makes generation trustworthy).
3. **P0-3 non-agentic provider** (Ollama/API) — the reliability escape hatch.
4. **P1-1 login finalisation**, then **P2** usability items.

## "Without breaking it" — the contract
- New providers/validation go **behind** `cli_provider` / `generate_text`; Gemini + OpenAI paths
  untouched.
- Every fix lands with a test (P1-2), so the next refactor can't silently regress it.
- Keep the zip secret-clean + size-bounded as an automated gate.
