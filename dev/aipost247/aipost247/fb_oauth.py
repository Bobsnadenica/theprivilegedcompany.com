"""Facebook Login (OAuth) — log in via the browser, then auto-discover the Page.

Removes the need to find a Page ID or generate a token by hand: the user logs in
with Facebook and picks a Page from a list, and we fetch the (long-lived) Page
access token automatically.

NOTE: Facebook still requires a one-time Meta app (App ID + App Secret) — there
is no way to post to a Page without a registered app. While the app is in
*Development* mode, you (as an app admin/developer/tester) can manage your own
Pages without App Review.

Setup required in the Meta app once:
  * Add the "Facebook Login" product.
  * Under Facebook Login -> Settings -> Valid OAuth Redirect URIs, add:
        http://localhost:8723/
"""
from __future__ import annotations

import http.server
import secrets
import time
import urllib.parse
import webbrowser

import requests

from .config import DEFAULT_GRAPH_VERSION
from .facebook_client import FacebookClient, FacebookError
from .logging_setup import get_logger

log = get_logger("fb_oauth")

DEFAULT_PORT = 8723
SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"]
GRAPH_ROOT = "https://graph.facebook.com"
APP_DASHBOARD_URL = "https://developers.facebook.com/apps/"


def guided_meta_app_setup(port: int = DEFAULT_PORT) -> None:
    """Open the Meta dashboard and walk the user through one-time app creation."""
    redirect = f"http://localhost:{port}/"
    print(
        "\n  ------------------------------------------------------------------\n"
        "  Create your Meta app — one time, about 3-5 minutes\n"
        "  (Facebook only lets apps post to a Page through a registered app —\n"
        "   the same reason tools like autopost24 charge to 'connect Facebook'.)\n"
        "  ------------------------------------------------------------------\n"
        "  1. A browser opens to Meta for Developers. Log in with Facebook.\n"
        "  2. 'Create app' -> App details: enter an App name + email -> Next.\n"
        "  3. Use cases: filter by 'All' and choose\n"
        "     'Manage everything on your Page' -> Next.\n"
        "     (This enables pages_manage_posts + pages_read_engagement and\n"
        "      fixes the 'Invalid Scopes' error.)\n"
        "  4. Business: click 'Create a business portfolio' (or connect one),\n"
        "     then finish -> Create app.\n"
        "  5. Facebook Login settings (use case -> Customize, or\n"
        "     'Facebook Login -> Settings'): add this EXACT Valid OAuth Redirect\n"
        f"     URI and Save:\n         {redirect}\n"
        "  6. App Settings -> Advanced: mark it as a desktop / native app.\n"
        "  7. App Settings -> Basic: copy your App ID and App Secret.\n"
        "  ------------------------------------------------------------------\n"
        "  Prefer a visual guide? Open dev/aipost247/index.html in your browser.\n"
    )
    try:
        webbrowser.open(APP_DASHBOARD_URL)
    except Exception:  # noqa: BLE001
        print("  (Open this URL yourself: " + APP_DASHBOARD_URL + ")")
    input("  Press Enter once you have your App ID and App Secret ... ")


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    """Captures the ?code=... (or ?error=...) Facebook redirects back to us."""

    code: str | None = None
    error: str | None = None
    expected_state: str | None = None

    def do_GET(self):  # noqa: N802 - required name
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path not in ("/", ""):
            self.send_response(404)
            self.end_headers()
            return
        params = urllib.parse.parse_qs(parsed.query)

        if "error" in params:
            _CallbackHandler.error = params.get("error_description", params.get("error"))[0]
            message = "Login was cancelled or failed. You can close this tab."
        elif "code" in params and params.get("state", [None])[0] == _CallbackHandler.expected_state:
            _CallbackHandler.code = params["code"][0]
            message = "Login successful! Return to the terminal — you can close this tab."
        else:
            _CallbackHandler.error = "Invalid OAuth response (state mismatch)."
            message = "Login error. You can close this tab."

        body = (
            "<html><body style='font-family:sans-serif;text-align:center;margin-top:18%'>"
            f"<h2>AIPost247</h2><p>{message}</p></body></html>"
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *args):  # silence the default access logging
        return


def _wait_for_code(port: int, state: str, redirect_uri: str, timeout: int = 300) -> str:
    _CallbackHandler.code = None
    _CallbackHandler.error = None
    _CallbackHandler.expected_state = state
    try:
        server = http.server.HTTPServer(("localhost", port), _CallbackHandler)
    except OSError as exc:
        raise FacebookError(f"Could not start local login server on port {port}: {exc}") from exc
    server.timeout = 1
    deadline = time.time() + timeout
    try:
        while time.time() < deadline and _CallbackHandler.code is None and _CallbackHandler.error is None:
            server.handle_request()
    finally:
        server.server_close()

    if _CallbackHandler.error:
        raise FacebookError(f"Facebook login: {_CallbackHandler.error}")
    if not _CallbackHandler.code:
        raise FacebookError(
            "Timed out waiting for the Facebook login. Common causes:\n"
            "  • 'Invalid Scopes: pages_read_engagement, pages_manage_posts' —\n"
            "    those permissions aren't ACTIVE yet. (1) Add the use case\n"
            "    'Manage everything on your Page'. (2) Add a Privacy Policy URL\n"
            "    (App Settings -> Basic). (3) Test once in Graph API Explorer:\n"
            "    pick your app, add the permissions, Generate Access Token.\n"
            "    No App Review or 'Publish' needed for your own Page. (See the\n"
            "    guide: index.html, step 8.)\n"
            "  • 'URL blocked' / 'redirect_uri is not allowed' — add this EXACT\n"
            f"    redirect URI to the app and Save, then retry:\n        {redirect_uri}\n"
            "    (Facebook Login -> Settings -> Valid OAuth Redirect URIs)"
        )
    return _CallbackHandler.code


def _choose_default(pages: list[dict]) -> dict:
    if len(pages) == 1:
        return pages[0]
    print("\nSelect the Page to post to:")
    for index, page in enumerate(pages, 1):
        print(f"  [{index}] {page.get('name', '(no name)')}  (id {page.get('id')})")
    while True:
        choice = input(f"Choice (1-{len(pages)}): ").strip()
        if choice.isdigit() and 1 <= int(choice) <= len(pages):
            return pages[int(choice) - 1]
        print("  Invalid choice — try again.")


def login_and_select_page(
    app_id: str,
    app_secret: str,
    api_version: str = DEFAULT_GRAPH_VERSION,
    port: int = DEFAULT_PORT,
    choose=None,
):
    """Run the full browser login + Page selection. Returns (id, token, name)."""
    if not (app_id and app_secret):
        raise FacebookError("Meta App ID and App Secret are required for Facebook login.")

    redirect_uri = f"http://localhost:{port}/"
    state = secrets.token_urlsafe(16)
    query = urllib.parse.urlencode(
        {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "response_type": "code",
            "scope": ",".join(SCOPES),
        }
    )
    auth_url = f"https://www.facebook.com/{api_version}/dialog/oauth?{query}"

    print("\nOpening Facebook login in your browser ...")
    print("If it doesn't open, paste this URL into your browser:\n  " + auth_url + "\n")
    try:
        webbrowser.open(auth_url)
    except Exception:  # noqa: BLE001 - headless box, just show the URL
        pass

    code = _wait_for_code(port, state, redirect_uri)

    # code -> short-lived user token
    try:
        response = requests.get(
            f"{GRAPH_ROOT}/{api_version}/oauth/access_token",
            params={
                "client_id": app_id,
                "redirect_uri": redirect_uri,
                "client_secret": app_secret,
                "code": code,
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        raise FacebookError(f"Network error exchanging the login code: {exc}") from exc
    payload = response.json() if response.content else {}
    if "access_token" not in payload:
        message = payload.get("error", {}).get("message", response.text[:200])
        raise FacebookError(f"Could not exchange login code for a token: {message}")
    user_token = payload["access_token"]

    # extend to a long-lived user token (so the derived Page token won't expire)
    try:
        user_token = FacebookClient.exchange_long_lived_user_token(
            app_id, app_secret, user_token, api_version
        )
    except FacebookError as exc:
        log.warning("Could not extend the token lifetime (%s); continuing.", exc)

    # list the Pages this user manages
    try:
        response = requests.get(
            f"{GRAPH_ROOT}/{api_version}/me/accounts",
            params={"access_token": user_token, "limit": 200},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise FacebookError(f"Network error listing your Pages: {exc}") from exc
    payload = response.json() if response.content else {}
    if "data" not in payload:
        message = payload.get("error", {}).get("message", response.text[:200])
        raise FacebookError(f"Could not list your Pages: {message}")
    pages = payload["data"]
    if not pages:
        raise FacebookError(
            "Your account does not manage any Pages, or the app was not granted "
            "the pages_show_list permission."
        )

    page = (choose or _choose_default)(pages)
    token = page.get("access_token")
    if not token:
        raise FacebookError(f"Selected Page {page.get('id')} returned no access token.")
    return str(page["id"]), token, page.get("name", "(page)")
