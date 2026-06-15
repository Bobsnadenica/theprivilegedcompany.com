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

### Step 2 · Create an app
1. Go to **https://developers.facebook.com/apps/** and click **Create app**.
2. If asked *what you want your app to do*, choose **Other** → **Next**.
3. Select app type **Business** → **Next**.
4. Enter an **App name** (anything, e.g. `My Page Poster`) and your contact email,
   then click **Create app** (re-enter your Facebook password if prompted).

### Step 3 · Add Facebook Login and the redirect URI
1. On the app dashboard, open **Add products** (or **Use cases**) and add
   **Facebook Login for Business** (or **Facebook Login**) → **Set up**.
2. Open that product's **Settings**.
3. In **Valid OAuth Redirect URIs**, paste the following **exactly**, then **Save**:

   ```
   http://localhost:8723/
   ```

   It must be `http` (not `https`), port `8723`, **with the trailing slash**.

### Step 4 · Copy your App ID and App Secret
1. In the left menu, open **App settings → Basic**.
2. Copy the **App ID** shown at the top.
3. Next to **App Secret**, click **Show** (re-enter your password) and copy it.

That is the entire Facebook setup. Keep the App ID and App Secret handy for Part 2.

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

## Permissions requested
`pages_show_list`, `pages_read_engagement`, `pages_manage_posts` — only enough to
list your Pages and publish posts to the one you choose. In Development mode these
work for **your own** Pages with no review.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| "URL Blocked" / "redirect_uri isn't allowed" | The redirect URI isn't saved. Add `http://localhost:8723/` **exactly** under Facebook Login → Settings, then Save. |
| Browser login never returns / times out | Same as above — the redirect URI must match exactly. |
| Your Page is not in the list | You must be an **admin** of the Page, and grant the requested permissions during login. |
| "Invalid or expired token" later on | Re-run `./run.sh setup` and log in again. |
| `Port 8723 already in use` | Close whatever is using it and retry. |

## Security notes
- Your **App Secret** and **Page token** live only in `dev/aipost247/.env`
  (permissions `600`, gitignored). They are never committed, uploaded, or shared.
- Post text is sent only to Google (Gemini); tokens are sent only to Facebook.
- Nothing about this app is hosted by anyone else — it runs entirely on your machine.
