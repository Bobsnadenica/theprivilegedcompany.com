# AIPost247 — Autonomous Facebook Auto-Poster

AIPost247 generates **contextual Facebook posts** with Antigravity, Gemini,
Codex, or the OpenAI API, using a local **memory/skill store** as context. It
publishes them to a **Facebook Page** through the official **Graph API**, on a
schedule you choose, and runs locally on Python 3.9+.

```
local memory (SQLite + memory/*.md)
        │  build context
        ▼
   selected AI provider ─► generated post ─► Facebook Graph API ─► your Page
        ▲                                                                  │
        └──────────────── record post back into memory ◄──────────────────┘
                          (repeats on a schedule)
```

---

## 1. Quick start

### Download &amp; run (no Git needed)

Download **[aipost247.zip](download/aipost247.zip)** (or from the
[guide page](index.html)), unzip it, then:

- **macOS / Linux:** open a terminal in the folder and run `./run.sh`
- **Windows:** double-click `run.bat`

The launcher sets everything up and starts the setup wizard.

### Easiest — one command (from a Git checkout)

```bash
cd dev/aipost247

./run.sh            # macOS / Linux / WSL / Git Bash
# run.bat           # Windows (double-click or run in cmd)
```

`run.sh` / `run.bat` create an isolated virtual environment (`.venv`), install
the dependencies into it, and launch the app. The default opens the web
dashboard for setup and monitoring. Any argument is forwarded to the app, e.g.
`./run.sh generate`, `./run.sh post-now`, `./run.sh run`.

### Alternative — plain Python

```bash
cd dev/aipost247
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
python run.py
```

Inside the virtual environment, `run.py` checks for the required packages and
installs them from `requirements.txt` if they are missing — then opens the
dashboard.

> Tip: a virtual environment (created for you by `run.sh`) keeps the install
> from touching your system Python.

---

## 2. Setup — you mostly just *log in*

**Prerequisites:** Python 3.9+. Antigravity installs as a standalone CLI.
Gemini requires Node.js 20+; Codex requires a current Node.js release from
<https://nodejs.org>.

The wizard (`./run.sh setup` or `run.bat setup`) has 4 short steps:

### Step 1 — Content generator (pick one)
- **Antigravity — recommended, no API key.** AIPost247 installs Google's
  current CLI and opens a **"Login with Google"** flow. It writes posts from an
  isolated temporary workspace and never needs access to your project files.
- **Gemini CLI — optional.** Kept for accounts where the legacy CLI remains
  supported.
- **Codex — optional, no API key.** Uses `codex exec` in a read-only,
  ephemeral workspace. The project folder is never auto-trusted.
- **OpenAI — optional.** Paste a key from
  <https://platform.openai.com/api-keys> (the `openai` package is then installed
  on demand).

### Step 2 — Facebook: log in, then pick your Page

> 📘 **Step-by-step walkthrough (create a developer account → app → App
> ID/Secret):** open **[`dev/aipost247/index.html`](index.html)** in your browser
> (or the text version [FACEBOOK_SETUP.md](FACEBOOK_SETUP.md)). Do that once, and
> everything else runs locally from the script.

> **The one unavoidable bit:** Facebook does **not** let any app post to a Page
> without a **registered Meta app**. So you provide an **App ID + App Secret
> once**. After that you simply **log in with Facebook and choose your Page** —
> AIPost247 fetches the Page ID and a long-lived token for you. No token hunting.

One-time, at <https://developers.facebook.com/apps>:
1. Create an app (type **Business**).
2. Add the **Facebook Login** product.
3. Redirect URI: in **Development** mode (default) `http://localhost` is allowed
   automatically — nothing to add. Only in Live mode add `http://localhost:8723/`
   under **Facebook Login → Settings → Valid OAuth Redirect URIs**.
4. Copy your **App ID** and **App Secret** (Settings → Basic).

Then in setup pick **"Log in with Facebook"**, enter App ID + Secret once, log in
in the browser, and select your Page. Permissions used: `pages_show_list`,
`pages_read_engagement`, `pages_manage_posts`. While your app is in
**Development** mode you can manage your **own** Pages without App Review.

> Prefer to do it manually? Choose the manual option and paste a Page ID + token.

All credentials are saved to a local **`.env`** (permissions `600`, gitignored).
Nothing is hardcoded; data only goes to Google/OpenAI and Facebook themselves.

---

## 3. Commands

```bash
./run.sh dashboard        # open the web dashboard (DEFAULT — configure + monitor in the browser)
./run.sh setup            # terminal configuration wizard (alternative to the dashboard)
./run.sh generate         # generate ONE post and print it — does NOT publish
./run.sh post-now         # generate AND publish one post immediately
./run.sh run              # start the autonomous loop headless (no UI)
./run.sh status           # show config (secrets masked) + recent posts
./run.sh login-gemini     # log in to the selected login-only AI provider
./run.sh train            # open the "train your business" form (a skill)
./run.sh learn            # read engagement → refresh skill.md (what works)
./run.sh clear-memory     # wipe accumulated memory (history/learnings/profile)

./run.sh add-instruction "Always mention free shipping over $50."
./run.sh add-knowledge "Fall blend ships Oct 1." --topic products
```

**Recommended first run:** `./run.sh generate` to preview the AI's output
safely, then `./run.sh post-now`, then `./run.sh run`.

---

## 4. The memory / skill store

Two layers, both local, act as the program's context:

| Layer | Location | What it's for |
| --- | --- | --- |
| SQLite DB | `data/aipost247.db` | history of posts, CLI instructions, knowledge |
| Text files | `memory/instructions.md` | brand voice / standing instructions |
| Text files | `memory/knowledge/*.md` / `*.txt` | domain knowledge, FAQs, product info |

Before every post, AIPost247 blends these (plus your recent posts, so it doesn't
repeat itself) into the prompt. **Edit the files in `memory/` anytime** — changes
take effect on the next cycle.

---

## 5. Scheduling

During setup choose either:

- **Interval** — every N hours/minutes (e.g. `6` = 6h, `90m` = 90 min), or
- **Daily** — specific times like `09:00,18:00` (your machine's local time).

`run` keeps the process alive and posts on that schedule. To keep it running in
the background after closing the terminal:

```bash
nohup ./run.sh run > /dev/null 2>&1 &     # macOS/Linux
# or use tmux / screen, or a systemd service / Windows Task Scheduler
```

---

## 6. Reliability & safety

- **Robust loop:** every cycle is wrapped in error handling, so provider and
  read-only API failures are logged without crashing the scheduler.
- **Duplicate protection:** ambiguous Facebook writes are never retried.
  Publishing pauses until you check the Page and resolve the warning in the
  dashboard.
- **Single active job:** generation, publishing, learning, and feedback
  consolidation cannot overlap within one folder.
- **Invalid token / key:** detected and reported with the exact fix
  (`./run.sh setup` / `run.bat setup`).
- **Logs:** console + rotating file at `logs/aipost247.log`.
- **Live progress:** the dashboard streams provider progress, timeout
  countdowns, cancellation, and application logs while a job runs.
- **Dry run:** set `DRY_RUN=true` (or choose it in setup) to generate posts
  without publishing while you tune the brand voice.
- **No secrets in code or git:** `.env`, `data/`, and `logs/` are gitignored.

---

## 7. Project layout

```
dev/aipost247/
├── run.sh                 # one-command launcher (venv + install + run) — macOS/Linux
├── run.bat                # one-command launcher for Windows
├── run.py                 # launcher: checks deps, then runs the app
├── requirements.txt
├── .env.example           # template (copy to .env, or just run setup)
├── .gitignore             # keeps .env / data / logs out of git
├── README.md
├── memory/
│   ├── instructions.md    # brand voice (edit me)
│   └── knowledge/*.md     # domain knowledge (edit me)
├── data/                  # SQLite DB (created at runtime, gitignored)
├── logs/                  # rotating logs (created at runtime, gitignored)
└── aipost247/             # the application package
    ├── app.py             # orchestration + CLI
    ├── config.py          # paths, Config, .env I/O, setup wizard
    ├── memory.py          # SQLite + folder memory store
    ├── facebook_client.py # Graph API: exchange / validate / publish
    ├── fb_oauth.py        # Facebook Login (browser) + Page picker
    ├── gemini_client.py   # Gemini CLI content generation (login with Google)
    ├── openai_client.py   # OpenAI content generation (optional provider)
    ├── scheduler.py       # interval / daily scheduling loop
    └── logging_setup.py   # console + file logging
```

---

## 8. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Facebook token invalid` (code 190) | Token expired/revoked — re-run `./run.sh setup` / `run.bat setup`. |
| `Rate limited by Facebook` | Normal under heavy use; it retries next cycle. Lower your frequency. |
| `OpenAI rejected the API key` | Check the key and that billing is enabled, then `setup`. |
| Auto-install fails | Use `./run.sh` / `run.bat`, or create a venv before running `python -m pip install -r requirements.txt`. |
| Posts feel generic | Add detail to `memory/instructions.md` and `memory/knowledge/`. |

> Per Meta and OpenAI terms, you are responsible for the content you publish.
> Only post to Pages you own/manage, and review AI output (use `generate`/dry-run)
> until its tone and factual accuracy match your standards.
