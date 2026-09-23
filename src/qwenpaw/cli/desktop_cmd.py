# -*- coding: utf-8 -*-
"""CLI command: run 小铁智友 app on a free port in a native webview window."""
# pylint:disable=too-many-branches,too-many-statements,consider-using-with
from __future__ import annotations

import logging
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path
from typing import Any

import click

from ..constant import LOG_LEVEL_ENV
from ..utils.logging import setup_logger

try:
    import webview
except ImportError:
    webview = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class WebViewAPI:
    """API exposed to the webview for external links and file downloads."""

    # Registrable domains whose cookies keep the SSO session alive.
    SSO_COOKIE_DOMAINS = ["tyrz.crec.cn"]

    def __init__(self):
        self._kb_windows: list[Any] = []

    # ------------------------------------------------------------------
    # Desktop shortcut helper (called once from main at startup)
    # ------------------------------------------------------------------
    def open_external_link(self, url: str) -> None:
        """Open URL in system's default browser."""
        if not url.startswith(("http://", "https://")):
            return
        webbrowser.open(url)

    def open_knowledge_base(self, url: str) -> bool:
        """Open the knowledge base system in a separate native window.

        Why a native window instead of an iframe: the CREC unified
        identity provider (tyrz.crec.cn) blocks OAuth login flows
        running inside a cross-site iframe ("登录地址存在安全风险").
        A top-level native window is a normal browsing context, so the
        IdP allows the login. Because the window shares the webview
        cookie store with the main window, the SSO session established
        during the main app login is reused — no second scan needed.

        SSO auto-login: instead of loading the KB app directly (which
        shows its manual-login page when no local token exists), we
        open the KB's SSO authorize endpoint first. That endpoint
        plants a state cookie and 302-redirects to tyrz.crec.cn. With
        the shared IdP session cookie present, the IdP silently
        redirects back with a code, the KB backend exchanges it for a
        token and lands on /dashboard — the whole chain runs without
        user interaction. If the IdP session is gone, the user simply
        sees the IdP login page in this window and scans as usual;
        afterwards the KB remembers its own token.

        Falls back to the system browser when no webview window exists
        (e.g. pure browser mode).

        Args:
            url: Knowledge base URL to open (e.g. .../dashboard). The
                origin is extracted to build the SSO authorize URL.

        Returns:
            True if a native window was created, False if the caller
            should fall back to iframe/browser handling.
        """
        if not url.startswith(("http://", "https://")):
            return False

        if not (webview and webview.windows):
            # No webview runtime (browser mode) — caller falls back
            logger.info(
                "open_knowledge_base: no webview available, fallback",
            )
            return False

        try:
            from urllib.parse import urlencode, urlparse

            parsed = urlparse(url)
            origin = f"{parsed.scheme}://{parsed.netloc}"

            # Start at the KB's SSO authorize endpoint so the OAuth
            # chain runs automatically instead of stopping at the KB
            # manual-login page. If the KB backend 404s this path or
            # the IdP session is absent, the user lands on a login
            # page and can authenticate manually — same as before.
            sso_entry = (
                f"{origin}/api/v1/auth/sso/authorize?"
                + urlencode(
                    {
                        "redirect_uri": f"{origin}/api/v1/auth/sso/callback",
                    }
                )
            )

            # Re-inject the persisted IdP session cookie (harvested by
            # the poller / KB-window close handler) BEFORE the window
            # starts navigating, so the SSO authorize chain can complete
            # without showing the IdP QR-code login page.
            #
            # harvest() first: it merges the CURRENT store into the
            # backup, so restore() below can never overwrite a fresher
            # in-store cookie with a stale backup value (the poller may
            # lag up to its interval); it only fills in what's missing.
            try:
                from . import idp_cookies

                idp_cookies.harvest()
                idp_cookies.restore(domains=self.SSO_COOKIE_DOMAINS)
            except Exception:
                logger.exception("idp_cookies restore before KB window failed")

            kb_window = webview.create_window(
                "知识库 - 小铁智友",
                sso_entry,
                width=1440,
                height=900,
                text_select=True,
            )
            self._kb_windows.append(kb_window)

            def _on_kb_closed():
                # The IdP login page may have re-set its SESSION cookie
                # during this window's lifetime — snapshot it again.
                try:
                    from . import idp_cookies

                    idp_cookies.harvest()
                except Exception:
                    logger.exception("idp_cookies harvest after KB close failed")
                finally:
                    try:
                        self._kb_windows.remove(kb_window)
                    except ValueError:
                        pass

            kb_window.events.closed += _on_kb_closed

            logger.info(
                "open_knowledge_base: native window created, sso_entry=%s",
                sso_entry,
            )
            return True
        except Exception:
            logger.exception("open_knowledge_base failed for %s", url)
            return False

    def clear_sso_cookies(self) -> bool:
        """Clear all webview cookies (SSO session) for logout.

        Uses pywebview's native clear_cookies() which properly clears
        WKWebView's in-memory cookie store on macOS and WebView2's
        cookie store on Windows. This is the only reliable way to clear
        cross-origin cookies (e.g. tyrz.crec.cn SSO session) —
        deleting cookie files on disk does NOT clear in-memory cookies.
        """
        try:
            if webview and webview.windows:
                # pywebview >= 4 has Window.clear_cookies()
                win = webview.windows[0]
                if hasattr(win, "clear_cookies"):
                    win.clear_cookies()
                    logger.info("Cleared all webview cookies via clear_cookies()")
                else:
                    # Fallback for older pywebview: evaluate JS to clear
                    # cookies for the current domain
                    logger.warning(
                        "clear_cookies not available, using JS fallback",
                    )
                    win.evaluate_js(
                        "document.cookie.split(';').forEach("
                        "function(c){"
                        "document.cookie = c.trim().split('=')[0] + "
                        "'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';"
                        "});"
                    )
            else:
                logger.warning("No webview window available to clear cookies")

            # Drop the persistent IdP cookie backup too — otherwise the
            # next poller tick or KB-window restore would resurrect the
            # just-cleared SSO session.
            try:
                from . import idp_cookies

                idp_cookies.delete_backup()
            except Exception:
                logger.exception("idp_cookies.delete_backup failed")

            # Also delete cookie files on disk as a belt-and-suspenders measure
            import glob as _glob
            if sys.platform == "darwin":
                for pattern in [
                    "~/Library/HTTPStorages/*crecpaw*.binarycookies",
                    "~/Library/HTTPStorages/*CrecPaw*.binarycookies",
                ]:
                    for f in _glob.glob(os.path.expanduser(pattern)):
                        try:
                            os.remove(f)
                            logger.info("Removed cookie file: %s", f)
                        except Exception:
                            pass
            elif sys.platform == "win32":
                base = os.path.expanduser(
                    "~/AppData/Local/com.crec.crecpaw/EBWebView/Default"
                )
                for cf in [
                    os.path.join(base, "Network", "Cookies"),
                    os.path.join(base, "Cookies"),
                ]:
                    if os.path.isfile(cf):
                        try:
                            os.remove(cf)
                            logger.info("Removed cookie file: %s", cf)
                        except Exception:
                            pass

            return True
        except Exception as exc:
            logger.warning("Failed to clear SSO cookies: %s", exc)
            return False

    def save_file(self, url: str, filename: str) -> bool:
        """Download a file from *url* and save it via a native save dialog.

        Shows the OS "Save As" dialog so the user can pick a destination,
        then downloads the file and writes it there.  This is the desktop
        equivalent of the browser's ``<a download>`` click pattern which
        pywebview/WebView2 does not support.

        Args:
            url: Full HTTP(S) URL of the file to download.
            filename: Default filename shown in the save dialog.

        Returns:
            True if the file was saved successfully, False if the user
            cancelled the dialog or an error occurred.
        """
        import re
        import shutil
        import urllib.request

        # If the URL is relative (e.g. "/api/workspace/files/raw/xxx"),
        # prepend the local server origin so urllib can fetch it.
        if not url.startswith(("http://", "https://")):
            if url.startswith("/"):
                # Use localhost with the same port the webview is serving from
                # We can get this from the current webview window's URL
                try:
                    current_url = webview.windows[0].get_current_url()
                    if current_url:
                        from urllib.parse import urlparse
                        parsed = urlparse(current_url)
                        url = f"{parsed.scheme}://{parsed.netloc}{url}"
                except Exception:
                    logger.error("save_file: cannot resolve relative URL %s", url)
                    return False
            else:
                logger.error("save_file: invalid URL %s", url)
                return False

        logger.info("save_file: url=%s, filename=%s", url, filename)

        # Sanitize filename: remove characters illegal on Windows
        safe_name = re.sub(r'[<>:"/\\|?*]', "_", filename).strip(" .")

        try:
            # Show native OS save dialog via pywebview
            result = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=safe_name,
            )
            if not result:
                logger.info("save_file: user cancelled save dialog")
                return False  # user cancelled

            dest_path = result if isinstance(result, str) else result[0]
            logger.info("save_file: saving to %s", dest_path)

            # Download from the local backend and write to chosen path
            # Auth is handled by the frontend passing the token in the URL
            # or by the auth middleware skipping certain paths
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as response:
                with open(dest_path, "wb") as f:
                    shutil.copyfileobj(response, f)

            logger.info("save_file: success")
            return True
        except Exception:
            logger.exception("save_file failed")
            return False


    def reveal_file(self, file_path: str) -> bool:
        """在系统文件管理器中选中并显示指定文件（跨平台）。

        Args:
            file_path: 要在文件管理器中选中的文件绝对路径。

        Returns:
            True 成功打开, False 文件不存在或平台不支持。
        """
        if not os.path.isfile(file_path):
            logger.warning("reveal_file: file not found – %s", file_path)
            return False
        try:
            if sys.platform == "darwin":
                # macOS Finder 选中文件
                subprocess.run(["open", "-R", file_path], check=False, timeout=5)
            elif sys.platform == "win32":
                # Windows 资源管理器选中 — /select, 和路径之间不能有空格
                # explorer.exe 要求路径使用反斜杠
                win_path = os.path.normpath(file_path)
                subprocess.run(
                    ["explorer", f"/select,{win_path}"], check=False, timeout=5,
                    creationflags=0x08000000,  # CREATE_NO_WINDOW
                )
            else:
                # Linux 打开所在目录
                subprocess.run(
                    ["xdg-open", os.path.dirname(file_path)],
                    check=False, timeout=5,
                )
            return True
        except Exception:
            logger.exception("reveal_file failed for %s", file_path)
            return False

    def select_folder(self) -> str:
        """Show a native folder selection dialog and return the chosen path.

        Returns:
            The selected folder path as a string, or empty string if
            the user cancelled or an error occurred.
        """
        try:
            result = webview.windows[0].create_file_dialog(
                webview.FOLDER_DIALOG,
            )
            if not result:
                return ""
            return result if isinstance(result, str) else result[0]
        except Exception:
            logger.exception("select_folder failed")
            return ""

    def preview_file(self, file_path: str) -> bool:
        """Open a local file with the OS default application (e.g. Preview for PDF).

        The webview (WKWebView / WebView2) does not support the HTML
        ``download`` attribute, so a bare ``<a href=... download>`` pointing
        at a file URL makes the webview navigate away from the SPA and render
        the file inline. Once that happens the React app is destroyed and the
        window appears frozen. Routing "open file" requests through this
        method keeps the webview untouched and opens the file in the proper
        system application instead.

        Args:
            file_path: Absolute path of the local file to open.

        Returns:
            True if launched successfully, False if the file does not
            exist or the platform is unsupported.
        """
        if not os.path.isfile(file_path):
            logger.warning("preview_file: file not found – %s", file_path)
            return False
        try:
            if sys.platform == "darwin":
                subprocess.run(["open", file_path], check=False, timeout=5)
            elif sys.platform == "win32":
                os.startfile(file_path)  # pylint:disable=no-member
            else:
                subprocess.run(
                    ["xdg-open", file_path], check=False, timeout=5,
                )
            return True
        except Exception:
            logger.exception("preview_file failed for %s", file_path)
            return False



def _create_desktop_shortcut_once() -> None:
    """Create a macOS alias on the Desktop the very first time 小铁智友 runs.

    Uses AppleScript (osascript) to create a real macOS Finder alias
    (not a plain symlink) so the icon and app association are preserved.
    A stamp file ``~/.crecpaw_desktop_shortcut_created`` prevents re-running.
    """
    if sys.platform != "darwin":
        return  # only macOS for now

    stamp = os.path.expanduser("~/.crecpaw_desktop_shortcut_created")
    if os.path.exists(stamp):
        return  # already done

    # Locate the running .app bundle
    # When frozen by PyInstaller the executable is inside Contents/MacOS/.
    app_path: str | None = None
    exe = sys.executable  # e.g. .../小铁智友.app/Contents/MacOS/小铁智友
    # Walk up until we find the .app bundle
    candidate = exe
    for _ in range(6):
        candidate = os.path.dirname(candidate)
        if candidate.endswith(".app"):
            app_path = candidate
            break

    if not app_path or not os.path.isdir(app_path):
        logger.debug("_create_desktop_shortcut_once: .app bundle not found, skipping")
        return

    desktop = os.path.expanduser("~/Desktop")
    if not os.path.isdir(desktop):
        logger.debug("_create_desktop_shortcut_once: Desktop not found, skipping")
        return

    app_name = os.path.basename(app_path)  # e.g. "小铁智友.app"
    alias_name = app_name  # alias has same name on Desktop
    alias_path = os.path.join(desktop, alias_name)

    if os.path.exists(alias_path):
        # Already present (maybe placed manually) — write stamp and return
        try:
            open(stamp, "w").close()
        except OSError:
            pass
        return

    # Use AppleScript to create a proper Finder alias
    script = f'''
tell application "Finder"
    set theApp to POSIX file "{app_path}" as alias
    set theDesktop to POSIX file "{desktop}" as alias
    make new alias file at theDesktop to theApp
end tell
'''
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            logger.info("Desktop shortcut created: %s", alias_path)
            open(stamp, "w").close()
        else:
            logger.warning(
                "Failed to create desktop shortcut: %s", result.stderr.strip()
            )
    except Exception as exc:
        logger.warning("_create_desktop_shortcut_once error: %s", exc)


# ── 固定端口：保证 localStorage origin 在应用重启后不变 ──
# 若环境变量 CRECPAW_DESKTOP_PORT 设置了则优先使用，否则用默认固定端口


def _kill_port_owner(port: int) -> bool:
    """Kill any process listening on *port* via lsof (macOS/Linux).

    Returns ``True`` if at least one process was terminated.
    """
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True, timeout=5,
        )
        pids = [p.strip() for p in result.stdout.strip().split("\n") if p.strip()]
        if not pids:
            return False
        for pid in pids:
            try:
                os.kill(int(pid), signal.SIGTERM)
                logger.info(
                    "Killed stale process %s on port %d", pid, port,
                )
            except Exception:
                pass
        return True
    except Exception:
        return False


def _get_desktop_port(host: str = "127.0.0.1") -> int:
    """Return the desktop port, preferring CRECPAW_DESKTOP_PORT env var."""
    env_port = os.environ.get("CRECPAW_DESKTOP_PORT", "").strip()
    if env_port:
        try:
            return int(env_port)
        except ValueError:
            logger.warning(
                "Invalid CRECPAW_DESKTOP_PORT=%s, using default", env_port,
            )

    # Default fixed port — same port every launch = same origin = localStorage persists
    default_port = 58665
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, default_port))
            return default_port
        except OSError:
            # Port is occupied — try to kill the stale process and retry
            logger.warning(
                "Default port %d is busy, attempting to free it...",
                default_port,
            )
            _kill_port_owner(default_port)
            time.sleep(1)
            try:
                sock.bind((host, default_port))
                return default_port
            except OSError:
                logger.warning(
                    "Port %d still busy after cleanup, using OS-assigned port",
                    default_port,
                )
                sock.bind((host, 0))
                return sock.getsockname()[1]


def _wait_for_http(host: str, port: int, timeout_sec: float = 300.0) -> bool:
    """Return True when something accepts TCP on host:port."""
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(2.0)
                s.connect((host, port))
                return True
        except (OSError, socket.error):
            time.sleep(1)
    return False


def _clear_webview_cache() -> None:
    """Clear WKWebView/WebView2 HTTP cache before opening window.

    IMPORTANT: We must NOT delete ``~/.crecpaw_webview_data`` wholesale
    because it also stores localStorage (including the auth token
    ``qwenpaw_auth_token``).  Deleting it forces the user to re-login
    on every app launch.

    Instead, we only clear the HTTP cache subdirectories, preserving
    localStorage, sessionStorage, cookies, and IndexedDB.
    """
    import shutil as _shutil

    # macOS: only clear HTTP cache, NOT the full WebsiteData store
    if sys.platform == "darwin":
        # WKWebView stores HTTP cache in Cache.db inside this directory.
        # We only remove the Caches subdirectory, preserving localStorage.
        for cache_subdir in (
            "Caches/com.crec.crecpaw",
        ):
            p = os.path.expanduser(f"~/Library/{cache_subdir}")
            if os.path.isdir(p):
                try:
                    _shutil.rmtree(p)
                    logger.info("Cleared HTTP cache: %s", p)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Failed to clear %s: %s", p, exc)

    # Windows: WebView2 - only clear the cache, not the full user data
    if sys.platform == "win32":
        cache_dir = os.path.expanduser(
            "~/AppData/Local/com.crec.crecpaw/EBWebView/Default/Cache",
        )
        if os.path.isdir(cache_dir):
            try:
                _shutil.rmtree(cache_dir)
                logger.info("Cleared WebView2 cache: %s", cache_dir)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to clear %s: %s", cache_dir, exc)


def _stream_reader(in_stream, out_stream) -> None:
    """Read from in_stream line by line and write to out_stream.

    Used on Windows to prevent subprocess buffer blocking. Runs in a
    background thread to continuously drain the subprocess output.
    """
    try:
        for line in iter(in_stream.readline, ""):
            if not line:
                break
            out_stream.write(line)
            out_stream.flush()
    except Exception:
        pass
    finally:
        try:
            in_stream.close()
        except Exception:
            pass


# ── Splash 窗口 HTML ──────────────────────────────────────────────────────

_SPLASH_HTML = """<!doctype html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: linear-gradient(135deg, #1a2a3a 0%, #0d1b2a 100%);
    font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif;
    overflow: hidden;
    -webkit-user-select: none; user-select: none;
  }
  .logo {
    width: 96px; height: 96px;
    border-radius: 20px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 24px;
    box-shadow: 0 4px 20px rgba(25, 97, 172, 0.4);
  }
  .logo img { width: 100%; height: 100%; object-fit: cover; }
  .title {
    font-size: 18px; font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    margin-bottom: 8px;
  }
  .subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 28px;
  }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #1961AC;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="logo">
    <img src="data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAABQAAD/4QOJaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA2LjAtYzAwNiA3OS5kYWJhY2JiLCAyMDIxLzA0LzE0LTAwOjM5OjQ0ICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOkIwQTEwQThCNTc1MDExRjFBRTFCRDg0QjYwOTRCQTg2IiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOjQwRjlFQzA4NTdENDExRjFBNTYyREJBMTg1NDIzRjU5IiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjQwRjlFQzA3NTdENDExRjFBNTYyREJBMTg1NDIzRjU5IiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyMi40IChNYWNpbnRvc2gpIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6MDZiMjgwYjMtOGFlMy00OGI5LWFjNDctZjYxNjE2NjMxOTljIiBzdFJlZjpkb2N1bWVudElEPSJhZG9iZTpkb2NpZDpwaG90b3Nob3A6N2YwZDEzM2MtYTU3Ni03MjRmLWI4NGUtNDU3YjY0MzNhYzFhIi8+IDwvcmRmOkRl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" alt="小铁智友" />
  </div>
  <div class="title">小铁智友</div>
  <div class="subtitle">正在启动，请稍候...</div>
  <div class="spinner"></div>
</body>
</html>"""


def _open_main_window_after_ready(
    host: str,
    port: int,
    splash_window: Any,
    api_instance: "WebViewAPI",
) -> None:
    """Wait for HTTP ready in background, then open main window and close splash.

    Runs as a daemon thread started before webview.start().
    """
    timeout_sec = 300.0
    if _wait_for_http(host, port, timeout_sec=timeout_sec):
        logger.info("HTTP ready, creating main webview window...")
        _clear_webview_cache()

        # Re-inject persisted cookies (incl. the IdP SSO session) into
        # the shared WKWebsiteDataStore before any window navigates.
        # The splash window's NSApplication run loop is already running
        # at this point, so AppHelper.callAfter inside idp_cookies works.
        try:
            from . import idp_cookies

            restored = idp_cookies.restore(domains=api_instance.SSO_COOKIE_DOMAINS)
            logger.info("idp_cookies: startup restore done (%d cookies)", restored)
        except Exception:
            logger.exception("idp_cookies startup restore failed")

        try:
            main_window = webview.create_window(
                "小铁智友 Desktop",
                f"http://{host}:{port}",
                width=1280,
                height=800,
                text_select=True,
                js_api=api_instance,
                maximized=True,
            )
            # Close splash after main window is created
            if splash_window is not None:
                splash_window.destroy()

            # Snapshot cookies once the main window has finished loading
            # (the app itself may have planted session cookies), then
            # keep the on-disk backup fresh so the next launch can
            # restore the IdP SSO session without a new QR scan.
            def _initial_harvest():
                try:
                    from . import idp_cookies

                    idp_cookies.harvest()
                    idp_cookies.start_poller(interval_sec=60.0)
                except Exception:
                    logger.exception("idp_cookies initial harvest failed")

            main_window.events.loaded += _initial_harvest
        except Exception:
            logger.exception("Failed to create main window")
    else:
        logger.error("Server did not become ready in time.")
        # Show error in splash window
        if splash_window is not None:
            try:
                splash_window.load_html(
                    '<html><body style="display:flex;align-items:center;'
                    'justify-content:center;height:100vh;margin:0;'
                    'font-family:sans-serif;background:#1a2a3a;color:#fff;">'
                    '<div style="text-align:center;">'
                    '<h2>启动失败</h2>'
                    '<p>服务器未能在规定时间内启动，请稍后重试。</p>'
                    '</div></body></html>'
                )
            except Exception:
                pass



@click.command("desktop")
@click.option(
    "--host",
    default="127.0.0.1",
    show_default=True,
    help="Bind host for the app server.",
)
@click.option(
    "--log-level",
    default="info",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug", "trace"],
        case_sensitive=False,
    ),
    show_default=True,
    help="Log level for the app process.",
)
def desktop_cmd(
    host: str,
    log_level: str,
) -> None:
    """Run 小铁智友 app on an auto-selected free port in a webview window.

    Starts the FastAPI app in a subprocess on a free port, then opens a
    native webview window loading that URL. Use for a dedicated desktop
    window without conflicting with an existing 小铁智友 app instance.
    """
    # Setup logger for desktop command (separate from backend subprocess)
    setup_logger(log_level)

    # ── 清除 macOS quarantine 隔离标记 ──
    # 从浏览器下载的 zip 解压后 macOS 会加 com.apple.quarantine 标记，
    # 导致 Gatekeeper 拦截。在启动时自动清除，确保新用户也能正常打开。
    if sys.platform == "darwin":
        try:
            exe = Path(sys.executable).resolve()
            app_bundle = exe
            for _ in range(5):
                if app_bundle.suffix == ".app":
                    break
                app_bundle = app_bundle.parent
            if app_bundle.suffix == ".app":
                subprocess.run(
                    ["xattr", "-cr", str(app_bundle)],
                    capture_output=True, timeout=5,
                )
                logger.info("Cleared quarantine attributes on %s", app_bundle)
        except Exception:
            pass

    # ── 首次运行：在桌面创建快捷方式 ──
    _create_desktop_shortcut_once()

    port = _get_desktop_port(host)
    url = f"http://{host}:{port}"
    click.echo(f"Starting 小铁智友 app on {url} (port {port})")
    logger.info("Server subprocess starting...")

    env = os.environ.copy()
    env[LOG_LEVEL_ENV] = log_level

    if "SSL_CERT_FILE" in env:
        cert_file = env["SSL_CERT_FILE"]
        if os.path.exists(cert_file):
            logger.info(f"SSL certificate: {cert_file}")
        else:
            logger.warning(
                f"SSL_CERT_FILE set but not found: {cert_file}",
            )
    else:
        logger.warning("SSL_CERT_FILE not set on environment")

    is_windows = sys.platform == "win32"
    proc = None
    manually_terminated = (
        False  # Track if we intentionally terminated the process
    )
    try:
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "qwenpaw",
                "app",
                "--host",
                host,
                "--port",
                str(port),
                "--log-level",
                log_level,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE if is_windows else sys.stdout,
            stderr=subprocess.PIPE if is_windows else sys.stderr,
            env=env,
            bufsize=1,
            universal_newlines=True,
        )
        try:
            if is_windows:
                stdout_thread = threading.Thread(
                    target=_stream_reader,
                    args=(proc.stdout, sys.stdout),
                    daemon=True,
                )
                stderr_thread = threading.Thread(
                    target=_stream_reader,
                    args=(proc.stderr, sys.stderr),
                    daemon=True,
                )
                stdout_thread.start()
                stderr_thread.start()
            logger.info("Waiting for HTTP ready (with splash window)...")

            # Create splash window first — shows immediately while backend starts
            api = WebViewAPI()
            splash = webview.create_window(
                "小铁智友",
                html=_SPLASH_HTML,
                width=420,
                height=320,
                resizable=False,
                text_select=False,
                frameless=True,
                easy_drag=True,
                on_top=True,
            )

            # Start background thread: wait for HTTP, then open main window
            # and close splash. This thread runs concurrently with
            # webview.start() which blocks the main thread.
            ready_thread = threading.Thread(
                target=_open_main_window_after_ready,
                args=(host, port, splash, api),
                name="wait-http-ready",
                daemon=True,
            )
            ready_thread.start()

            logger.info("Calling webview.start() with splash (blocks until closed)...")

            # ── WebView2 (Windows): 允许 iframe 跨站携带统一认证 SSO cookie ──
            # 知识库系统（http://10.2.38.143:5173）以 iframe 嵌入且为 http 内网站点，
            # Chromium 默认 SameSite=Lax-by-default 会拦截其 OAuth 回跳 cookie，
            # 导致 iframe 内统一认证登录失败。通过 WebView2 官方环境变量
            # WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 注入关闭相关特性的参数。
            # macOS WKWebView 无此限制，无需处理。
            if sys.platform == "win32":
                extra_args = os.environ.get(
                    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "",
                )
                disable_features = (
                    "--disable-features=SameSiteByDefaultCookies,"
                    "CookiesWithoutSameSiteMustBeSecure"
                )
                # 追加而不是覆盖，避免与其他特性参数冲突
                if "disable-features" in extra_args:
                    logger.info(
                        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS already set: %s",
                        extra_args,
                    )
                else:
                    merged = (
                        f"{extra_args} {disable_features}".strip()
                        if extra_args
                        else disable_features
                    )
                    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = merged
                    logger.info(
                        "Set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: %s", merged,
                    )

            webview.start(
                private_mode=False,
                storage_path=os.path.expanduser(
                    "~/.crecpaw_webview_data",
                ),
            )  # blocks until user closes the window
            logger.info("webview.start() returned (window closed).")
        finally:
            # Ensure backend process is always cleaned up
            # Wrap all cleanup operations to handle race conditions:
            # - Process may exit between poll() and terminate()
            # - terminate()/kill() may raise ProcessLookupError/OSError
            # - We must not let cleanup exceptions mask the original error
            if proc and proc.poll() is None:  # process still running
                logger.info("Terminating backend server...")
                manually_terminated = (
                    True  # Mark that we're intentionally terminating
                )
                try:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5.0)
                        logger.info("Backend server terminated cleanly.")
                    except subprocess.TimeoutExpired:
                        logger.warning(
                            "Backend did not exit in 5s, force killing...",
                        )
                        try:
                            proc.kill()
                            proc.wait()
                            logger.info("Backend server force killed.")
                        except (ProcessLookupError, OSError) as e:
                            # Process already exited, which is fine
                            logger.debug(
                                f"kill() raised {e.__class__.__name__} "
                                f"(process already exited)",
                            )
                except (ProcessLookupError, OSError) as e:
                    # Process already exited between poll() and terminate()
                    logger.debug(
                        f"terminate() raised {e.__class__.__name__} "
                        f"(process already exited)",
                    )
            elif proc:
                logger.info(
                    f"Backend already exited with code {proc.returncode}",
                )

        # Only report errors if process exited unexpectedly
        # (not manually terminated)
        # On Windows, terminate() doesn't use signals so exit codes vary
        # (1, 259, etc.)
        # On Unix/Linux/macOS, terminate() sends SIGTERM (exit code -15)
        # Using a flag is more reliable than checking specific exit codes
        if proc and proc.returncode != 0 and not manually_terminated:
            logger.error(
                f"Backend process exited unexpectedly with code "
                f"{proc.returncode}",
            )
            # Follow POSIX convention for exit codes:
            # - Negative (signal): 128 + signal_number
            # - Positive (normal): use as-is
            # Example: -15 (SIGTERM) -> 143 (128+15), -11 (SIGSEGV) ->
            # 139 (128+11)
            if proc.returncode < 0:
                sys.exit(128 + abs(proc.returncode))
            else:
                sys.exit(proc.returncode or 1)
    except KeyboardInterrupt:
        logger.warning("KeyboardInterrupt in main, cleaning up...")
        raise
    except Exception as e:
        logger.error(f"Exception: {e!r}")
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        raise
