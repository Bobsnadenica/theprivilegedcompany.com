"""Facebook Graph API client — token exchange, validation, and publishing.

Designed to fail loudly with *specific* exceptions so the scheduler loop can
react correctly (retry on rate limit, stop and warn on an invalid token, etc.)
without ever crashing.
"""
from __future__ import annotations

import time

import requests

from .config import DEFAULT_GRAPH_VERSION
from .logging_setup import get_logger

log = get_logger("facebook")

GRAPH_ROOT = "https://graph.facebook.com"
REQUEST_TIMEOUT = 30

# Graph API error codes that mean "you are being throttled".
_RATE_LIMIT_CODES = {4, 17, 32, 613}
_RATE_LIMIT_SUBCODES = {2446079, 1390008}


class FacebookError(Exception):
    """Base class for all Facebook client errors."""


class FacebookAuthError(FacebookError):
    """The access token is invalid or expired (Graph code 190)."""


class FacebookRateLimitError(FacebookError):
    """The Page/app is being rate limited; try again later."""


class FacebookAmbiguousWriteError(FacebookError):
    """A write may have reached Facebook, so retrying could create a duplicate."""


class FacebookClient:
    """Minimal Graph API wrapper for publishing text posts to a Page."""

    def __init__(
        self,
        page_id: str,
        page_token: str,
        app_id: str = "",
        app_secret: str = "",
        api_version: str = DEFAULT_GRAPH_VERSION,
    ) -> None:
        self.page_id = page_id
        self.page_token = page_token
        self.app_id = app_id
        self.app_secret = app_secret
        self.api_version = api_version or DEFAULT_GRAPH_VERSION
        self.base = f"{GRAPH_ROOT}/{self.api_version}"

    # --- low level -------------------------------------------------------
    def _request(self, method: str, url: str, *, params=None, data=None, retries: int | None = None):
        """Retry safe reads; never retry a write whose outcome may be ambiguous."""
        method = method.upper()
        if retries is None:
            retries = 1 if method == "POST" else 3
        last_error: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                response = requests.request(
                    method, url, params=params, data=data, timeout=REQUEST_TIMEOUT
                )
            except (requests.ConnectionError, requests.Timeout) as exc:
                if method == "POST":
                    raise FacebookAmbiguousWriteError(
                        "Връзката прекъсна по време на публикуване. Facebook може да е "
                        "приел публикацията; няма да опитаме автоматично втори път. "
                        "Проверете страницата преди ново публикуване."
                    ) from exc
                last_error = exc
                wait = min(2 ** attempt, 30)
                log.warning(
                    "Network error talking to Facebook (%s). Retry %d/%d in %ds.",
                    exc, attempt, retries, wait,
                )
                time.sleep(wait)
                continue

            try:
                payload = response.json()
            except ValueError:
                payload = {}

            if response.ok and "error" not in payload:
                return payload

            error = payload.get("error", {}) if isinstance(payload, dict) else {}
            code = error.get("code")
            subcode = error.get("error_subcode")
            message = error.get("message") or response.text[:200]

            if code == 190:
                raise FacebookAuthError(f"Invalid or expired token: {message}")
            if code in _RATE_LIMIT_CODES or subcode in _RATE_LIMIT_SUBCODES:
                raise FacebookRateLimitError(f"Rate limited by Facebook: {message}")
            if 500 <= response.status_code < 600:
                if method == "POST":
                    raise FacebookAmbiguousWriteError(
                        f"Facebook върна server error {response.status_code} след изпращане. "
                        "Публикацията може да е създадена; проверете страницата преди нов опит."
                    )
                last_error = FacebookError(f"Server error {response.status_code}: {message}")
                wait = min(2 ** attempt, 30)
                log.warning("Facebook 5xx (%s). Retry %d/%d in %ds.", message, attempt, retries, wait)
                time.sleep(wait)
                continue

            raise FacebookError(f"Facebook API error (code {code}): {message}")

        raise FacebookError(f"Request failed after {retries} attempts: {last_error}")

    # --- public API ------------------------------------------------------
    def validate(self) -> str:
        """Confirm the token can read the Page; return the Page name."""
        data = self._request(
            "GET",
            f"{self.base}/{self.page_id}",
            params={"fields": "name", "access_token": self.page_token},
        )
        return data.get("name", "(unknown page)")

    def post(self, message: str) -> str:
        """Publish a text post to the Page feed; return the new post id."""
        data = self._request(
            "POST",
            f"{self.base}/{self.page_id}/feed",
            data={"message": message, "access_token": self.page_token},
        )
        post_id = data.get("id")
        if not post_id:
            raise FacebookError(f"Post did not return an id. Response: {data}")
        return post_id

    def get_post_engagement(self, post_id: str) -> dict:
        """Return {likes, comments, shares} for a published post.

        Uses pages_read_engagement. Powers the self-improvement loop.
        """
        data = self._request(
            "GET",
            f"{self.base}/{post_id}",
            params={
                "fields": "likes.summary(true),comments.summary(true),shares",
                "access_token": self.page_token,
            },
        )
        likes = (data.get("likes") or {}).get("summary", {}).get("total_count", 0)
        comments = (data.get("comments") or {}).get("summary", {}).get("total_count", 0)
        shares = (data.get("shares") or {}).get("count", 0)
        return {"likes": int(likes or 0), "comments": int(comments or 0), "shares": int(shares or 0)}

    # --- token helpers (used by the setup wizard) ------------------------
    @staticmethod
    def exchange_long_lived_user_token(
        app_id: str, app_secret: str, short_token: str, api_version: str = DEFAULT_GRAPH_VERSION
    ) -> str:
        """Trade a short-lived user token for a long-lived (~60 day) one."""
        if not (app_id and app_secret and short_token):
            raise FacebookError("App ID, App Secret and a User Token are all required.")
        try:
            response = requests.get(
                f"{GRAPH_ROOT}/{api_version}/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "fb_exchange_token": short_token,
                },
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise FacebookError(f"Network error during token exchange: {exc}") from exc
        payload = response.json() if response.content else {}
        if "access_token" not in payload:
            message = payload.get("error", {}).get("message", response.text[:200])
            raise FacebookError(f"Token exchange failed: {message}")
        return payload["access_token"]

    @staticmethod
    def fetch_page_token(
        user_token: str, page_id: str, api_version: str = DEFAULT_GRAPH_VERSION
    ) -> str:
        """Find the Page Access Token for ``page_id`` among the managed Pages.

        A Page token derived from a *long-lived* user token does not expire,
        which is exactly what we want to store.
        """
        try:
            response = requests.get(
                f"{GRAPH_ROOT}/{api_version}/me/accounts",
                params={"access_token": user_token, "limit": 200},
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise FacebookError(f"Network error fetching Pages: {exc}") from exc
        payload = response.json() if response.content else {}
        if "data" not in payload:
            message = payload.get("error", {}).get("message", response.text[:200])
            raise FacebookError(f"Could not list Pages: {message}")
        for page in payload["data"]:
            if str(page.get("id")) == str(page_id):
                token = page.get("access_token")
                if token:
                    return token
                raise FacebookError(f"Page {page_id} found but no access_token returned.")
        managed = ", ".join(str(p.get("id")) for p in payload["data"]) or "(none)"
        raise FacebookError(
            f"Page id {page_id} is not among the Pages you manage. Managed: {managed}"
        )
