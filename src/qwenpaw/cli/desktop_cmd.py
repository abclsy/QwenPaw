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

    def __init__(self):
        pass

    # ------------------------------------------------------------------
    # Desktop shortcut helper (called once from main at startup)
    # ------------------------------------------------------------------
    def open_external_link(self, url: str) -> None:
        """Open URL in system's default browser."""
        if not url.startswith(("http://", "https://")):
            return
        webbrowser.open(url)

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
    width: 72px; height: 72px;
    border-radius: 16px;
    background: #1961AC;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 24px;
    box-shadow: 0 4px 20px rgba(25, 97, 172, 0.4);
  }
  .logo svg { width: 40px; height: 40px; }
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
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
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
