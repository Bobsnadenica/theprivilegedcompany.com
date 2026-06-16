# Sprint Plan: Migrate AIPost247 off Gemini CLI → Antigravity CLI

**Status:** PLANNED (not started) · **Drafted:** 2026-06-17
**Team:** 1 (owner) + Claude Code as implementer
**Sprint length:** ~1 focused day of work (≈6 effective hours), schedule ASAP — see "⚠ Urgency".

### Sprint Goal
> AIPost247 keeps generating posts for **free, with Google login and no API key**, after Google shuts off the old Gemini CLI on **June 18, 2026** — by switching the content provider to the **Antigravity CLI (`agy`)** behind the existing `gemini_client.py` abstraction, with no change to the rest of the app.

---

## ⚠ Urgency (read first)
- **Google deprecates Gemini CLI for free/consumer accounts on 2026-06-18.** After that, the
  current `gemini -p "…"` calls stop being served, so AIPost247's default (free) path **breaks**.
- This plan is to *execute another day*, but the window is essentially now. **Stopgap if the
  break happens before this sprint runs:** users can re-run setup and choose **OpenAI** (already
  supported, needs a paid API key), OR we ship the one-line provider switch (Task P0-1) first.

---

## Research findings (2026-06-17)

**Is Gemini CLI really being discontinued?** Yes. Free/personal and "AI Pro/Ultra" requests on
Gemini CLI and the Code Assist IDE extensions stop **2026-06-18**. Enterprise (Code Assist
licenses) can keep the legacy CLI for now. Google's successor is the **Antigravity CLI**.

**Is Antigravity "the same"? — Mostly the same for our use case, with a few breaking deltas.**

| Aspect | Gemini CLI (today) | Antigravity CLI (`agy`) | Impact on us |
|---|---|---|---|
| Binary | `gemini` | **`agy`** | rename in `gemini_client.py` |
| Install | `npm i -g @google/gemini-cli` (needs Node.js) | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` (Win: `irm …install.ps1 \| iex`) | **No more Node.js dependency** (a simplification) — but a new installer to script |
| One-shot prompt | `gemini -m M -p "…"` | **`agy -p "…"`** (same `-p`/`--print`) | near drop-in; **`-m` flag support unconfirmed** |
| Free Google login, no API key | ✅ browser OAuth | ✅ browser OAuth (headless = URL + one-time code) | value prop preserved 🎉 |
| Optional API key | n/a | `ANTIGRAVITY_API_KEY` env | nice for CI |
| Credentials cache | file: `~/.gemini/oauth_creds.json` | **system keyring** (not a file) | **breaks `_has_cached_credentials()`** — needs a new auth check |
| Default model | `gemini-2.5-flash` | Gemini 3.5 Flash / 3.1 Pro / Claude Sonnet·Opus / GPT-OSS 120B | **new model id** (verify exact string `agy` expects) |
| Feature parity | — | "not 1:1 out of the gate" | low risk for our minimal usage |

**Bottom line:** it is *not* a literal drop-in, but it's close. Our usage is tiny (one-shot text
generation + login detection), all isolated in `gemini_client.py`, so the blast radius is small.

Sources:
- [Google Developers Blog — Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [The Register — Bye-bye, Gemini CLI](https://www.theregister.com/ai-ml/2026/05/20/bye-bye-gemini-cli-google-nudges-devs-toward-antigravity/)
- [OSTechNix — Google is replacing Gemini CLI with Antigravity](https://ostechnix.com/google-is-replacing-gemini-cli-with-google-antigravity/)
- [DEV — Antigravity CLI hands-on (`agy`, install, `-p`)](https://dev.to/arindam_1729/antigravity-cli-a-hands-on-guide-to-googles-terminal-coding-agent-5bc7)

---

## Capacity
Solo build with Claude Code doing the edits. Estimate in effective hours; plan to ~75%.

| Person | Available | Allocation | Notes |
|---|---|---|---|
| Owner + Claude | ~1 day (~6h effective) | P0 only ≈ 4h | Leave buffer for the unknowns (`-m`, model id, keyring auth) |
| **Total** | **~6h** | **~4–5h committed** | P1/P2 are stretch |

---

## Sprint Backlog

| Priority | Item | Est. | Files / where | Dependencies |
|---|---|---|---|---|
| **P0-1** | **Spike: confirm `agy` contract** — install `agy`, run `agy -p "Reply with: OK"`, check: does `-m <model>` exist? exact free model id? exit codes/format on success, auth-needed, and rate-limit? where/how to detect "logged in" (keyring → is there `agy auth status`/`agy whoami`?). Record findings at top of this file. | 1.5h | terminal + notes | None — **do this first**, everything else depends on it |
| **P0-2** | **Add `agy` support in `gemini_client.py`** — make binary configurable (`AGENT_BIN`/detect `agy`→`gemini`), update `ensure_installed()` to use the curl/ps1 installer (drop the npm/Node path or keep as legacy fallback), update `DEFAULT_MODEL`/`FALLBACK_MODELS` to the new ids, keep the `-p` one-shot call. | 1h | `aipost247/gemini_client.py` | P0-1 |
| **P0-3** | **Fix login detection** — `_has_cached_credentials()` can't read `~/.gemini/oauth_creds.json` anymore. Replace with an `agy`-native check (auth-status command if it exists; else a cached lightweight `agy -p` probe with the existing capacity-vs-auth error classification). Keep `GeminiRateLimitError` vs `GeminiAuthError` logic. | 1h | `aipost247/gemini_client.py` (`_has_cached_credentials`, `is_authenticated`, `login`, `_select_oauth_auth_type`) | P0-1 |
| **P0-4** | **Verify end-to-end** — fresh setup → login → `generate` → `post-now`; confirm 429/auth/empty handling and the `run_loop` login gate still abort cleanly. Update the bundled smoke expectations. | 0.5h | manual + existing test patterns | P0-2, P0-3 |
| P1-1 | **Rename the abstraction** (optional polish): `gemini_client.py` → `agent_client.py` or keep filename but neutralize user-facing strings ("Gemini" → "Antigravity"/"AI"). Update `app.py` command `login-gemini` → add `login-ai` alias (keep old as alias). | 1h | `aipost247/*.py`, `run.sh`/`run.bat` help | P0-* |
| P1-2 | **Docs + website** — drop "Node.js required" everywhere (no longer needed!); update install line, model name, "login-gemini" naming; refresh `README.md`, `FACEBOOK_SETUP.md` is unaffected, `index.html` wizard text + commands table; bump `__version__` → 1.2.0. | 1h | `README.md`, `index.html`, `requirements.txt` note | P0-* |
| P2-1 | **Make the AI provider pluggable** — refactor so the content generator is a strategy chosen by config (`antigravity`/`openai`/`codex`/`copilot`/`ollama`), each exposing the same `generate(prompt)` + `is_authenticated()` + `login()` interface behind a registry. This is the foundation for the items below and protects against the next free-tier change. | 2h | `config.py`, new `providers/` (or `gemini_client.py` generalized), `app.generate_text` | P1-1 |
| **P2-3** | **Add free login-only providers (no API key, just an account you already have).** Offer these as selectable providers + a "login" button each in the dashboard. See Appendix for the verified contracts: | — | — | P2-1 |
| P2-3a | • **Codex CLI — "Sign in with ChatGPT"** (free ChatGPT tier works, browser OAuth, no key). One-shot via `codex exec "…"`; headless token via `CODEX_ACCESS_TOKEN`. | 1.5h | provider impl + dashboard option | P2-1 |
| P2-3b | • **GitHub Copilot CLI — GitHub login** (Copilot **Free** for any personal account). `copilot login`; non-interactive via `GITHUB_TOKEN`/`COPILOT_GITHUB_TOKEN`. | 1.5h | provider impl + dashboard option | P2-1 |
| P2-3c | • **Ollama (local, no account at all)** — fully free/offline; for the privacy/no-login crowd. Smaller models, uses local compute. | 1h | provider impl + dashboard option | P2-1 |
| P2-2 | **Repackage + verify zip** clean (no secrets), re-stamp version, test `run.bat` double-click path on Windows. | 0.5h | `package.sh` | P1-2 |

> **NOTE (do NOT pursue Qwen):** Qwen Code's free Qwen-OAuth tier was **discontinued 2026-04-15**
> — it now needs API keys, so it is no longer a "just login, free" option.

**Planned (committed): ~4h (P0)** · **Stretch: P1/P2/P2-3 ~9h** (the extra providers are independent — ship one at a time)

---

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| June 18 break lands before sprint runs | Free path dead; bot stops posting | Ship **P0-2** alone first (provider switch), or tell users to pick OpenAI temporarily |
| `agy` has no `-m` flag / different model ids | Generation calls fail | P0-1 spike confirms before coding; fall back to default model with no `-m` |
| Auth stored in keyring → no file to check | Can't detect "logged in"; loop may misbehave | P0-3: use `agy` auth-status cmd, else probe-and-classify (we already separate auth vs rate-limit) |
| Installer is curl-pipe-bash (security/AV friction on Windows) | Some users blocked | Document manual download from antigravity.google/download as alternative |
| "Not 1:1 feature parity" early | Unexpected output format | Our usage is minimal (plain `-p` text); add output trimming as today |
| Antigravity free tier limits/quotas differ | More 429s | Reuse existing `GeminiRateLimitError` + model fallback path |

---

## Definition of Done
- [ ] `./run.sh setup` → choose AI → logs into Google via `agy`, no API key, no Node.js.
- [ ] `./run.sh generate` and `post-now` produce posts via `agy`.
- [ ] `run_loop` still **refuses to start** when not logged in (gate intact).
- [ ] 429 / auth / empty-output handling verified (typed errors unchanged).
- [ ] Docs + website + version bumped; zip rebuilt and **verified clean of secrets**.
- [ ] OpenAI provider still works as the paid fallback.

## Key Dates
| Date | Event |
|---|---|
| 2026-06-18 | ⚠ Gemini CLI free requests stop being served |
| TBD (ASAP) | Sprint start — P0 spike + implementation |
| TBD +1 | Verify, docs, repackage, ship v1.3.0 (note: v1.2.0 already shipped — the web dashboard) |

## Rollback / safety
- Keep the `gemini`-binary code path behind a feature check so existing installs that still have a
  working `gemini` keep functioning until June 18; prefer `agy` when present.
- OpenAI provider remains the always-available paid escape hatch.
- No secrets in repo; `planning/` is excluded from the distributable zip.

---

## Appendix — free, login-only AI CLIs (no API key; verified 2026-06-17)

Goal: let users pick a generator using an account they **already have**, for free, without an API
key. These are the candidates for tasks **P2-3a/b/c**. All free tiers here are volatile — design the
provider as a config-selectable strategy (P2-1) so swapping is a setting, not a rewrite.

| Provider | Login with | Free? | One-shot / headless | Fit for AIPost247 |
|---|---|---|---|---|
| **Antigravity CLI** (`agy`) | Google | ✅ free preview (personal Gmail) | `agy -p "…"` | **Primary** — direct Gemini-CLI successor, same `-p`, same Google login |
| **OpenAI Codex CLI** | ChatGPT account ("Sign in with ChatGPT") | ✅ incl. ChatGPT **Free** tier | `codex exec "…"`; `CODEX_ACCESS_TOKEN` for headless | Strong 2nd — many users have a ChatGPT account |
| **GitHub Copilot CLI** | GitHub account | ✅ **Copilot Free** (any personal account) | non-interactive via `GITHUB_TOKEN`/`COPILOT_GITHUB_TOKEN` | Good — many users have GitHub |
| **Ollama** (local) | none (runs locally) | ✅ fully free / offline | `ollama run <model> "…"` | Privacy/no-account path; smaller models, local compute |
| ~~Qwen Code~~ | ~~Qwen OAuth~~ | ❌ free tier **ended 2026-04-15** | — | **Do not use** (now needs API keys) |

Caveats to validate during implementation: Codex has reported quirks where ChatGPT-login vs
API-key modes conflict; Copilot model access depends on the plan; Antigravity is "preview" with no
1:1 parity. Each provider's auth-detection differs (keyring / token file / env), so reuse the
typed-error pattern (`AuthError` vs `RateLimitError`) per provider.

**Sources:** Google Developers Blog (Gemini→Antigravity); OpenAI "Using Codex with your ChatGPT
plan" + Codex CLI auth docs; GitHub Docs "Authenticating Copilot CLI" + Copilot plans (Free);
QwenLM/qwen-code (OAuth tier discontinued).
