# Sprint Plan: Make AIPost247 reliably generate posts (free, login-only)

**Drafted:** 2026-06-24 · **Status:** PLAN (not started)
**Team:** 1 owner + Claude Code as implementer · **Length:** ~1 week (≈12 effective hours)
**Baseline:** v1.4.0 — 24 tests green; dashboard, provider_runtime (cancel/timeout/sandbox/secret-
filtered env), instance_lock, endpoint security, output-validation, multi-instance, packaging gates
(tests + secret-leak + <1.5 MB) all already shipped.

### Sprint Goal
> A new user can pick a **free, login-only** AI provider, and AIPost247 **reliably produces a real
> Facebook post** (verified end-to-end) — by confirming the agentic CLIs' real contract, adding a
> non-agentic free provider, and gating "ready" on a provider self-test.

---

## Why this sprint (the one open risk)
Everything is hardened *except the core value*: the default provider **Antigravity (`agy`) returns
"I need a brief" instead of a post**, because `agy`/`codex` are **agentic coding CLIs**, not clean
text generators, and their exact non-interactive contract is **unverified** (I can't run `agy` here).
OpenAI works (paid); Gemini is retired. So the product can look fully set up yet **never produce a
post**. This sprint closes that gap. (See `aipost247-provider-issue` memory + `sprint-antigravity-migration.md`.)

## Capacity
Solo build with Claude doing edits. Estimate in effective hours; plan to ~75% (P0 + part of P1).

| Who | Available | Committed | Notes |
|---|---|---|---|
| Owner + Claude | ~12h | ~8–9h (P0 + P1 core) | P2 is stretch; owner must run the P0-1 spike on a real machine |

## Sprint Backlog

| Pri | Item | Est | Files / where | Depends on |
|---|---|---|---|---|
| **P0-1** | **Spike: confirm `agy` + `codex` real contract.** Owner runs (on their machine): `agy --help`, the dashboard **"Тест на доставчика"** raw output, and `codex --help`. Wire the exact non-interactive flags (`--yolo`/`--yes`/`--output-format`/sandbox), login subcommand, and creds path into the `PROVIDERS` spec. | 2h | `cli_provider.py` (`PROVIDERS`), `provider_runtime.py` | **Owner-blocked** — needs a machine with `agy`/`codex` |
| **P0-2** | **Add Ollama as a non-agentic free provider.** `ollama run <model> "<prompt>"` is a clean one-shot completion — no account, no agentic detours. Add to `PROVIDERS`/dispatch, install/detect, model pick, dashboard option + hint. Implement + unit-test with mocked subprocess; owner verifies with Ollama installed. | 3h | `cli_provider.py`, `app.generate_text`, `dashboard.py`, `config.py`, tests | — (independent of P0-1) |
| **P0-3** | **End-to-end generation verify.** On ≥1 free provider, `generate` (preview) and `post-now` produce a real post that passes output-validation; confirm the run-loop login gate + cancel/timeout still behave. Capture as a smoke step. | 1h | manual + tests | P0-1 or P0-2 |
| P1-1 | **Smart provider picker + self-test gate.** Dashboard shows each provider's state (installed? logged-in? last self-test result) and recommends the one that *actually generated*. Setup wizard + dashboard block "ready/autopilot" until the chosen provider passes a real one-shot probe. | 2.5h | `dashboard.py`, `config.py` setup wizard, `cli_provider.recheck`/`raw_probe` | P0-2 |
| P1-2 | **Login UX finalisation.** Clean foreground terminal login + dashboard detection (the "Провери входа" probe already exists); remove any remaining reliance on web-driven code-paste. Clear "log in in the terminal" guidance per provider. | 1.5h | `cli_provider.login`, `dashboard._login_gemini` | P0-1 |
| P2-1 | **"Защо спря?" panel** — surface the last error (auth / rate-limit / generation / Facebook) + the one fix to try. | 1.5h | `dashboard.py`, `memory` executions | P1-1 |
| P2-2 | **Instance label** in dashboard header + tab title (tell multi-page instances apart). | 1h | `dashboard.py`, `config.py` | — |
| P2-3 | **Autopilot resilience** — pause + notify after N consecutive failures (don't burn cycles); persist on/off across restarts. | 2h | `dashboard.Autopilot` | — |
| P2-4 | **Maintainability** — split the ~1k-line inline dashboard HTML/CSS/JS into served files. | 2h | `dashboard.py` | — |

**Committed (~8–9h): P0-1, P0-2, P0-3, P1-1, P1-2** · **Stretch: P2-***

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| P0-1 spike blocked on owner (need `agy --help`) | Antigravity stays broken | **Ship P0-2 (Ollama) independently** so there's a reliable free path regardless |
| Ollama needs install + a model pull | Friction for non-technical users | Guided install + a small default model (e.g. `llama3.2:1b`/`qwen2.5:3b`); clear instructions; keep OpenAI as the no-install paid path |
| `agy`/`codex` flags still wrong after spike | Generation fails | Centralised `PROVIDERS` spec → one-line fix; the **self-test gate (P1-1)** turns silent failure into a visible ✗ |
| Free CLI tiers are volatile | A provider vanishes | Pluggable providers + self-test; OpenAI fallback |
| Touching generation could regress OpenAI/Gemini | Working paths break | All changes behind `generate_text`/`cli_provider`; every change lands with a test (24 green today) |

## Definition of Done
- [ ] A free provider produces a **real post** (preview + post-now), passing output-validation — verified end-to-end.
- [ ] **Ollama** selectable + working (owner-verified); appears in dashboard + setup.
- [ ] **Self-test gate**: can't start autopilot until the chosen provider passes a one-shot probe.
- [ ] Login finalised: terminal login + dashboard detection, clear per-provider guidance.
- [ ] All tests pass (existing 24 + new for Ollama + self-test); `package.sh` gates (tests, no secrets, <1.5 MB) pass.
- [ ] OpenAI + Gemini paths unchanged; version bumped; README/website + provider hints updated.

## Key Dates
| Date | Event |
|---|---|
| TBD | Sprint start — owner runs **P0-1 spike** (paste `agy --help` + "Тест на доставчика" output) |
| TBD | P0-2 Ollama lands; P0-3 e2e verify |
| TBD | P1 picker/self-test/login; ship vX.Y |
| TBD | Retro — which providers actually work, what to default to |

## Notes / assumptions
- "Without breaking it": additive, behind `generate_text`/`cli_provider`, each change with a test.
- Overlaps `sprint-antigravity-migration.md` (provider half) and `improvement-plan.md` (broader); this
  sprint is the focused **"reliable generation"** slice — do it first.
- Biggest unblock the owner can give Claude: paste `agy --help` + the **"Тест на доставчика"** raw
  output. Until then, **P0-2 (Ollama)** is the path to a working free generator.
