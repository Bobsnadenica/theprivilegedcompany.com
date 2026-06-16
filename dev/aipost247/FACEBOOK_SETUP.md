# Connecting Your Facebook Page

AIPost247 publishes to your Facebook **Page** through Facebook's official Graph
API. Facebook requires any app that posts to a Page to be a **registered Meta
app**, so you create one **once** (about 3–5 minutes). After that, **everything
runs locally from the script** — it logs you in, finds your Page, generates the
content, and publishes on your schedule. Your credentials are stored only in a
local `.env` file and are never uploaded or shared.

> **You manage your own Pages in the app's default _Development_ mode — no App
> Review and no Business Verification required.** Those are only needed if you
> want *other people* to use your app.

---

## Part 1 — One-time Facebook setup (~3–5 minutes)

### Step 1 · Create a Facebook developer account
1. Open **https://developers.facebook.com/**.
2. Click **Get Started** (top-right) and sign in with your normal Facebook account.
3. Accept the developer terms and confirm your email or phone number if prompted.

### Step 2 · Create an app (App details)
1. Go to **https://developers.facebook.com/apps/** and click **Create app**.
2. On **App details**, enter an **App name** (e.g. `My Page Poster`) and your
   contact email → **Next**.

### Step 3 · Use cases → "Manage everything on your Page"  (fixes "Invalid Scopes")
1. On the **Use cases** step, filter by **All** (there is no longer an "Other" option).
2. Choose **"Manage everything on your Page"** → **Next**.

   > This use case enables `pages_manage_posts` + `pages_read_engagement`. Without
   > it, Facebook rejects those scopes at login ("Invalid Scopes"). You do **not**
   > need a long-lived token first — the script creates that after you log in.

### Step 4 · Business portfolio, then create the app
1. When asked *"Want to connect a new business portfolio?"*, click
   **Create a business portfolio** (or connect an existing one). Give it a name
   and email. (Free, ~1 min; it helps the Page permissions work.)
2. Review **Requirements** and **Overview**, then click **Create app**.

### Step 5 · Copy your App ID and App Secret
1. Open **App Settings → Basic**.
2. Copy the **App ID** shown at the top.
3. Next to **App Secret**, click **Show** (re-enter your password) and copy it.

That's the whole setup. Keep the App ID and App Secret for Part 2, then run
`./run.sh setup`.

> **Good defaults you don't need to touch:** the **"Manage everything on your
> Page"** use case already includes `pages_show_list`, `pages_read_engagement`,
> and `pages_manage_posts`; `http://localhost` is allowed automatically in
> **Development** mode (no redirect URI to add); and **"Native or desktop app?"**
> is **No** by default (keep it No). See **Troubleshooting** if login still fails
> with "Invalid Scopes".

---

## Part 2 — Run the script (fully local from here)

```bash
cd dev/aipost247
./run.sh setup            # Windows: run.bat setup
```

In the wizard:

1. **Content generator** → choose **Gemini** and log in with Google (no API key).
2. **Facebook** → choose **[1] Connect with Facebook**, paste your **App ID** and
   **App Secret**. A browser opens → approve the permissions → **pick your Page**
   from the list. The script stores a long-lived Page token automatically.
3. **Schedule** → enter e.g. `2` to publish every 2 hours.

Then go live:

```bash
./run.sh run
```

It now generates and publishes to your Page on your schedule for as long as it
keeps running. To keep it running after you close the terminal:

```bash
nohup ./run.sh run > aipost247.out 2>&1 &     # macOS / Linux
```

Tip: run `./run.sh generate` first to preview a post **without** publishing.

---

## Permissions used
The **"Manage everything on your Page"** use case grants `pages_show_list`,
`pages_read_engagement`, and `pages_manage_posts` — enough to list your Pages,
**read engagement**, and **publish**. In Development mode these work for your
**own** Pages with no review.

Reading engagement also powers **self-improvement**: the script records which
posts performed best in `memory/skill.md`, and the AI uses that as context to
write better future posts. Refresh it manually anytime with `./run.sh learn`.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| "Invalid Scopes: pages_read_engagement, pages_manage_posts" / "This content isn't available right now" | The **"Manage everything on your Page"** use case (Step 3) usually includes the permissions already. If you see this, open your use case → Customize → Permissions → **Add** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Still failing? Add a Privacy Policy URL or generate a token once in Graph API Explorer. You do **not** need to Publish or pass App Review for your own Page. |
| "the app is configured as a desktop app" (during code exchange) | In **App Settings → Advanced**, turn **"Native or desktop app?"** to **No** and Save (it's No by default). A desktop app can't use an App Secret, which the script needs for the long-lived token. |
| "URL Blocked" / "redirect_uri isn't allowed" | In **Development** mode localhost is allowed automatically, so this is rare. If it happens (or the app is in Live mode), add `http://localhost:8723/` **exactly** under Facebook Login → Settings, then Save. |
| Browser login never returns / times out | Make sure the app is in **Development** mode. If it's Live, add the redirect URI exactly as above. |
| Your Page is not in the list | You must be an **admin** of the Page, and grant the requested permissions during login. |
| "Invalid or expired token" later on | Re-run `./run.sh setup` and log in again. |
| `Port 8723 already in use` | Close whatever is using it and retry. |

## Security notes
- Your **App Secret** and **Page token** live only in `dev/aipost247/.env`
  (permissions `600`, gitignored). They are never committed, uploaded, or shared.
- Post text is sent only to Google (Gemini); tokens are sent only to Facebook.
- Nothing about this app is hosted by anyone else — it runs entirely on your machine.
