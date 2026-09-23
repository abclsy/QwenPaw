# -*- coding: utf-8 -*-
"""Persistent cookie store for the CREC unified-identity (IdP) SSO session.

Why this exists
---------------
The desktop app shows the knowledge base (KB) in a separate pywebview
window.  The KB's silent-login chain needs a session cookie from the
CREC IdP (tyrz.crec.cn).  That IdP cookie is a *session* cookie (no
Expires/Max-Age), and WKWebView keeps session cookies in memory only —
they are NOT restored from the binarycookies file on the next app
launch.  The main app's own auth uses localStorage and never touches
the IdP, so the IdP session would be lost on every restart and the
user had to scan the QR code again each time.

Fix: periodically *harvest* every cookie in the shared
``WKWebsiteDataStore.defaultDataStore()`` cookie store to a JSON file,
and *restore* (re-inject) them back into the store before a KB window
is opened.  Re-injected session cookies are honored by WKWebView for
the lifetime of the process, so the SSO chain completes silently.

Implementation notes (macOS / cocoa backend, pywebview 6.x)
-----------------------------------------------------------
* All windows share ``WKWebsiteDataStore.defaultDataStore()`` (see
  pywebview's cocoa.py), so touching that class method directly works
  regardless of window creation order — no need for
  ``BrowserView.instances``.
* ``WKHTTPCookieStore.getAllCookies_`` completion handlers run on the
  main thread; ``AppHelper.callAfter`` (PyObjCTools) is the supported
  way to schedule them once the NSApplication run loop is running.
  This mirrors what pywebview's own ``get_cookies()`` does internally.
* pywebview's built-in ``Window.get_cookies()`` filters cookies by the
  *current page domain* (``domain not in self.url``) — useless for
  cross-domain IdP cookies, hence the raw snapshot here.
* Windows (WebView2) keeps cookies on disk itself, so persistence is
  a no-op there.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from typing import Any

logger = logging.getLogger(__name__)

# Default backup location.  Override in tests by reassigning the module attr.
COOKIE_FILE = os.path.expanduser("~/.crecpaw_webview_data/idp_cookies.json")

# Singleton poller thread reference (see start_poller).
_poller_thread: threading.Thread | None = None

_lock = threading.Lock()


def _import_cocoa():
    """Return (WebKit, Foundation, AppHelper) or None when not on macOS."""
    try:
        import Foundation
        import WebKit
        from PyObjCTools import AppHelper

        return WebKit, Foundation, AppHelper
    except ImportError:
        return None


def _cookie_key(c: dict[str, Any]) -> tuple[str, str, str]:
    return (c.get("domain", ""), c.get("path", ""), c.get("name", ""))


def _read_file() -> list[dict[str, Any]]:
    try:
        with open(COOKIE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        logger.warning("idp_cookies: unreadable backup %s", COOKIE_FILE)
        return []


def _write_file(cookies: list[dict[str, Any]]) -> None:
    directory = os.path.dirname(COOKIE_FILE)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cookies, f)
        os.replace(tmp_path, COOKIE_FILE)
    except Exception:
        logger.exception("idp_cookies: failed to write %s", COOKIE_FILE)
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def get_all_cookies() -> list[dict[str, Any]]:
    """Snapshot every cookie in the shared WKWebsiteDataStore.

    Returns a list of plain dicts (JSON-serializable).  Raises
    ImportError on non-macOS platforms.
    """
    WebKit, _Foundation, AppHelper = _import_cocoa()  # type: ignore[misc]
    store = WebKit.WKWebsiteDataStore.defaultDataStore().httpCookieStore()

    out: list[dict[str, Any]] = []
    sem = threading.Semaphore(0)

    def handler(cookies: Any) -> None:
        for c in cookies:
            try:
                expires = c.expiresDate()
                out.append(
                    {
                        "name": str(c.name()),
                        "value": str(c.value()),
                        "domain": str(c.domain()),
                        "path": str(c.path()) or "/",
                        "expires": (
                            expires.timeIntervalSince1970() if expires else None
                        ),
                        "secure": bool(c.isSecure()),
                        "httponly": bool(c.isHTTPOnly()),
                    }
                )
            except Exception:
                logger.exception("idp_cookies: failed to serialize a cookie")
        sem.release()

    AppHelper.callAfter(store.getAllCookies_, handler)
    if not sem.acquire(timeout=10):
        logger.warning("idp_cookies: getAllCookies_ timed out")
    return out


def harvest() -> int:
    """Merge current in-store cookies into the backup file.

    Merge (not replace) so an empty-ish store never wipes a good
    backup; fresher in-store values win per (domain, path, name).

    Returns the number of cookies harvested from the store.
    """
    if _import_cocoa() is None:
        return 0
    try:
        cookies = get_all_cookies()
    except Exception:
        logger.exception("idp_cookies: harvest failed")
        return 0
    if not cookies:
        return 0

    with _lock:
        merged: dict[tuple[str, str, str], dict[str, Any]] = {
            _cookie_key(c): c for c in _read_file()
        }
        for c in cookies:
            merged[_cookie_key(c)] = c
        _write_file(list(merged.values()))

    logger.info("idp_cookies: harvested %d cookies -> %s", len(cookies), COOKIE_FILE)
    return len(cookies)


def restore(domains: list[str] | None = None) -> int:
    """Re-inject backed-up cookies into the shared cookie store.

    Args:
        domains: Optional list of registrable domains (e.g.
            ["tyrz.crec.cn"]).  ``None`` restores every backed-up
            cookie.  A cookie matches when its domain equals the
            given one or is a subdomain of it.

    Returns the number of cookies submitted for re-injection.
    """
    if _import_cocoa() is None:
        return 0

    with _lock:
        cookies = _read_file()

    now = time.time()

    def _registrable(domain: str) -> str:
        return (domain or "").lstrip(".")

    targets = [
        c
        for c in cookies
        if (c.get("expires") or now + 1) > now
        and (
            domains is None
            or any(
                _registrable(c.get("domain", "")) == d
                or _registrable(c.get("domain", "")).endswith("." + d)
                for d in domains
            )
        )
    ]
    if not targets:
        return 0

    WebKit, Foundation, AppHelper = _import_cocoa()  # type: ignore[misc]
    store = WebKit.WKWebsiteDataStore.defaultDataStore().httpCookieStore()
    sem = threading.Semaphore(0)
    remaining = [len(targets)]

    def _one_done() -> None:
        remaining[0] -= 1
        if remaining[0] <= 0:
            sem.release()

    def _synth_cookie(t: dict[str, Any]) -> Any:
        """Build an NSHTTPCookie from a stored dict via Set-Cookie synthesis.

        ``cookieWithProperties_`` cannot express HttpOnly (the
        NSHTTPCookieHTTPOnly property constant does not exist), so we
        synthesize a Set-Cookie response header instead — that path
        preserves HttpOnly, Secure and Expires.

        Cookie-scope rules discovered by probing (macOS 15):
        * a ``Secure`` cookie synthesized against an ``http://`` URL is
          silently rejected (empty array) → always use ``https://``;
        * omitting ``Domain`` yields a host-only cookie (faithful
          roundtrip for e.g. tyrz.crec.cn's SESSION);
        * including ``Domain=.x`` yields a domain cookie.
        """
        parts = [f"{t['name']}={t['value']}", f"Path={t.get('path') or '/'}"]
        domain = t.get("domain", "")
        if domain.startswith("."):
            parts.append(f"Domain={domain}")
        if t.get("secure"):
            parts.append("Secure")
        if t.get("httponly"):
            parts.append("HttpOnly")
        if t.get("expires"):
            from email.utils import formatdate

            parts.append(f"Expires={formatdate(t['expires'], usegmt=True)}")
        scheme = "https" if t.get("secure") else "http"
        host = domain.lstrip(".") or "localhost"
        url = Foundation.NSURL.URLWithString_(f"{scheme}://{host}/")
        cookies = WebKit.NSHTTPCookie.cookiesWithResponseHeaderFields_forURL_(
            {"Set-Cookie": "; ".join(parts)}, url
        )
        return cookies[0] if cookies else None

    def inject() -> None:
        try:
            for t in targets:
                try:
                    cookie = _synth_cookie(t)
                except Exception:
                    logger.exception(
                        "idp_cookies: synthesize failed for %s (%s)",
                        t.get("name"),
                        t.get("domain"),
                    )
                    cookie = None
                if cookie is None:
                    _one_done()
                    continue
                store.setCookie_completionHandler_(cookie, _one_done)
        except Exception:
            logger.exception("idp_cookies: restore inject failed")
            sem.release()

    AppHelper.callAfter(inject)
    if not sem.acquire(timeout=10):
        logger.warning("idp_cookies: restore timed out")
    logger.info("idp_cookies: restored %d cookies from %s", len(targets), COOKIE_FILE)
    return len(targets)


def delete_backup() -> None:
    """Remove the backup file (used on logout / SSO cookie wipe)."""
    with _lock:
        try:
            os.remove(COOKIE_FILE)
            logger.info("idp_cookies: deleted backup %s", COOKIE_FILE)
        except FileNotFoundError:
            pass
        except Exception:
            logger.exception("idp_cookies: failed to delete %s", COOKIE_FILE)


def start_poller(interval_sec: float = 60.0) -> threading.Thread | None:
    """Start a daemon thread that harvests cookies every *interval_sec*.

    Idempotent: only the first call starts a thread; later calls are
    no-ops (the ``loaded`` event fires on every page reload, and the
    caller doesn't track whether a poller already exists).

    Returns the thread, or ``None`` on non-macOS platforms / when a
    poller is already running.
    """
    global _poller_thread
    if _import_cocoa() is None:
        return None
    if _poller_thread is not None and _poller_thread.is_alive():
        return None

    def loop() -> None:
        while True:
            time.sleep(interval_sec)
            try:
                harvest()
            except Exception:
                logger.exception("idp_cookies: poller iteration failed")

    _poller_thread = threading.Thread(
        target=loop, name="idp-cookie-poller", daemon=True
    )
    _poller_thread.start()
    logger.info("idp_cookies: poller started (every %.0fs)", interval_sec)
    return _poller_thread
