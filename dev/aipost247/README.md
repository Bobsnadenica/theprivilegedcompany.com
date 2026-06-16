# AIPost247 — Autonomous Facebook Auto-Poster

AIPost247 generates **contextual Facebook posts** with the OpenAI (ChatGPT) API —
using a local **memory/skill store** as context — and publishes them to a
**Facebook Page** via the official **Graph API**, on a schedule you choose. It
runs locally on any computer with Python 3.9+.

```
local memory (SQLite + memory/*.md)
        │  build context
        ▼
   OpenAI Chat API  ──►  generated post  ──►  Facebook Graph API  ──►  your Page
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
the dependencies into it, and launch the app. The first run drops you into the
setup wizard. Any argument is forwarded to the app, e.g. `./run.sh generate`,
`./run.sh post-now`, `./run.sh run`.

### Alternative — plain Python

```bash
cd dev/aipost247
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
python run.py
```

`run.py` also checks for the required packages and installs them from
`requirements.txt` if they are missing — then walks you through setup.

> Tip: a virtual environment (created for you by `run.sh`) keeps the install
> from touching your system Python.

---

## 2. Setup — you mostly just *log in*

**Prerequisites:** Python 3.9+, and (for the default Gemini provider)
**Node.js 18+** from <https://nodejs.org> (`brew install node`). The setup
installs the Gemini CLI for you.

The wizard (`./run.sh` or `python run.py setup`) has 4 short steps:

### Step 1 — Content generator (pick one)
- **Gemini — recommended, no API key.** AIPost247 installs Google's **Gemini
  CLI** and opens a **"Login with Google"** browser flow. Log in once and it
  writes your posts. Nothing to paste.
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
3. **Facebook Login → Settings → Valid OAuth Redirect URIs**, add exactly:
   `http://localhost:8723/`
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
python run.py setup            # (re)run the configuration wizard
python run.py generate         # generate ONE post and print it — does NOT publish
python run.py post-now         # generate AND publish one post immediately
python run.py run              # start the autonomous loop (default if no command)
python run.py status           # show config (secrets masked) + recent posts
python run.py login-gemini     # (re)log in to Google for the Gemini CLI
python run.py train            # open the "train your business" form (a skill)
python run.py learn            # read engagement → refresh skill.md (what works)

python run.py add-instruction "Always mention free shipping over $50."
python run.py add-knowledge "Fall blend ships Oct 1." --topic products
```

**Recommended first run:** `python run.py generate` to preview the AI's output
safely, then `python run.py post-now`, then `python run.py run`.

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
nohup python run.py run > /dev/null 2>&1 &     # macOS/Linux
# or use tmux / screen, or a systemd service / Windows Task Scheduler
```

---

## 6. Reliability & safety

- **Robust loop:** every cycle is wrapped in error handling. Rate limits,
  network drops, OpenAI/Facebook hiccups are logged and **retried next cycle** —
  the loop never crashes.
- **Invalid token / key:** detected and reported with the exact fix
  (`python run.py setup`).
- **Logs:** console + rotating file at `logs/aipost247.log`.
- **Dry run:** set `DRY_RUN=true` (or choose it in setup) to generate posts
  without publishing while you tune the brand voice.
- **No secrets in code or git:** `.env`, `data/`, and `logs/` are gitignored.

---

## 7. Project layout

```
dev/aipost247/
├── run.sh                 # one-command launcher (venv + install + run) — macOS/Linux
├── run.bat                # one-command launcher for Windows
├── run.py                 # launcher: auto-installs deps, then runs the app
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
| `Facebook token invalid` (code 190) | Token expired/revoked — re-run `python run.py setup`. |
| `Rate limited by Facebook` | Normal under heavy use; it retries next cycle. Lower your frequency. |
| `OpenAI rejected the API key` | Check the key and that billing is enabled, then `setup`. |
| Auto-install fails | Use a venv, or `python -m pip install -r requirements.txt`. |
| Posts feel generic | Add detail to `memory/instructions.md` and `memory/knowledge/`. |

> Per Meta and OpenAI terms, you are responsible for the content you publish.
> Only post to Pages you own/manage, and review AI output (use `generate`/dry-run)
> until you trust it.
