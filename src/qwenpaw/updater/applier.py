# -*- coding: utf-8 -*-
"""Apply downloaded update packages and restart the application."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

from ..constant import WORKING_DIR

logger = logging.getLogger(__name__)

# Where to store the apply-update script.
_UPDATE_DIR = WORKING_DIR / "updates"


def _get_app_path() -> Path:
    """Return the path to the currently running .app bundle or exe dir.

    In a PyInstaller frozen environment, ``sys.executable`` points to
    the executable inside the .app bundle (macOS) or the .exe (Windows).
    """
    exe = Path(sys.executable).resolve()

    if sys.platform == "darwin":
        # sys.executable = /path/to/小铁智友.app/Contents/MacOS/Xiaotiezhiyou
        # Walk up to find the .app bundle.
        current = exe
        for _ in range(5):
            if current.suffix == ".app":
                return current
            current = current.parent
        # Fallback: assume parent of Contents
        if exe.parent.name == "MacOS" and exe.parent.parent.name == "Contents":
            return exe.parent.parent.parent
        return exe

    # Windows / Linux: return the directory containing the exe.
    return exe.parent


def apply_update(zip_path: str) -> bool:
    """Apply the update by replacing the current app and restarting.

    This function spawns a detached script that:
    1. Waits for the current process to exit
    2. Replaces the .app bundle / install directory
    3. Restarts the application

    Returns ``True`` if the update script was launched successfully.
    The actual replacement happens after this function returns and the
    calling process exits.
    """
    zip_file = Path(zip_path)
    if not zip_file.is_file():
        logger.error("Update zip not found: %s", zip_path)
        return False

    _UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    target = _get_app_path()

    if sys.platform == "darwin":
        return _apply_macos(zip_file, target)
    if sys.platform == "win32":
        return _apply_windows(zip_file, target)
    logger.error("Unsupported platform for update: %s", sys.platform)
    return False


def _apply_macos(zip_path: Path, target_app: Path) -> bool:
    """Apply update on macOS: replace .app bundle and restart."""
    target_parent = target_app.parent
    app_name = target_app.name  # e.g. "小铁智友.app"

    # The restart command: open the new .app
    # We use a bash script that runs in a new session.
    script = f"""#!/bin/bash
set -e

# Wait for the current process to exit
sleep 2

# Remove old app bundle
rm -rf "{target_app}"

# Unzip new app bundle
cd "{target_parent}"
unzip -o "{zip_path}" >/dev/null 2>&1

# If the zip contains a top-level directory that is not the .app,
# try to find and move it.
if [ ! -d "{target_app}" ]; then
    # Look for the .app in the extracted contents
    FOUND_APP=$(find "{target_parent}" -maxdepth 2 -name "{app_name}" -type d 2>/dev/null | head -1)
    if [ -n "$FOUND_APP" ] && [ "$FOUND_APP" != "{target_app}" ]; then
        mv "$FOUND_APP" "{target_app}"
    fi
fi

# Clear macOS quarantine attribute so Gatekeeper doesn't block the app
xattr -cr "{target_app}"

# Clean up the zip
rm -f "{zip_path}"

# Restart the app
open "{target_app}"

# Remove this script
rm -f "$0"
"""

    script_path = _UPDATE_DIR / "apply_update.sh"
    script_path.write_text(script, encoding="utf-8")
    script_path.chmod(0o755)

    logger.info("Launching macOS update script: %s", script_path)
    try:
        subprocess.Popen(
            ["bash", str(script_path)],
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        logger.error("Failed to launch update script: %s", exc)
        return False

    return True


def _apply_windows(zip_path: Path, target_dir: Path) -> bool:
    """Apply update on Windows.

    The published Windows artifact is a zip containing an NSIS installer
    (CrecPaw-Setup-<ver>.exe), NOT a flat directory tree. The old
    implementation assumed flat files and Expand-Archive'd them over the
    install dir, which produced a broken install. Correct flow: extract
    the installer from the zip and run it (NSIS supports /S silent mode;
    it writes to the same $LOCALAPPDATA dir and recreates shortcuts).
    """
    target_parent = target_dir.parent

    # PIDs to wait for before touching install files: the backend exits
    # via restart_app() right after this script launches, but the webview
    # parent process needs a moment to follow (backend-exit-watcher in
    # desktop_cmd closes its windows). NSIS will fail on locked files if
    # we start too early.
    backend_pid = os.getpid()
    parent_pid = os.getppid()

    # PowerShell script for Windows
    script = f"""# Auto-update script for 小铁智友
# Wait (up to 60s) for the old app processes to exit so file locks are
# released before the installer runs.
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {{
    $alive = Get-Process -Id {backend_pid}, {parent_pid} -ErrorAction SilentlyContinue
    if (-not $alive) {{ break }}
    Start-Sleep -Milliseconds 500
}}

# Extract the installer from the update zip
$ErrorActionPreference = "Stop"
$extractDir = "{_UPDATE_DIR / 'extracted'}"
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Expand-Archive -Path "{zip_path}" -DestinationPath $extractDir -Force

# Find the NSIS installer (CrecPaw-Setup-*.exe or any setup exe)
$installer = Get-ChildItem -Path $extractDir -Filter "*.exe" |
    Where-Object {{ $_.Name -match "Setup|CrecPaw" }} |
    Select-Object -First 1
if (-not $installer) {{
    # Fall back to flat update (legacy zip layout: files only)
    Get-ChildItem -Path "{target_parent}" -Exclude "updates" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -Path "{zip_path}" -DestinationPath "{target_parent}" -Force
    Start-Process -FilePath "{target_dir / Path(sys.executable).name}"
}} else {{
    # Run installer silently; NSIS /S installs to the default dir.
    # The installer may require the old app to be closed — we are exiting.
    Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait
}}

# Clean up
Remove-Item -Path "{zip_path}" -Force -ErrorAction SilentlyContinue
Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
"""

    script_path = _UPDATE_DIR / "apply_update.ps1"
    # utf-8-sig (BOM): Windows PowerShell 5.1 misreads BOM-less UTF-8 as
    # ANSI and garbles the CJK install paths inside this script.
    script_path.write_text(script, encoding="utf-8-sig")

    logger.info("Launching Windows update script: %s", script_path)
    try:
        subprocess.Popen(
            [
                "powershell",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
            ],
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,  # type: ignore
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as exc:
        logger.error("Failed to launch update script: %s", exc)
        return False

    return True


def restart_app() -> None:
    """Restart the application by exiting and letting the OS relaunch.

    For webview apps, we call os._exit(0) to force-quit immediately.
    The update script (already running) will relaunch the app.
    """
    logger.info("Restarting application to apply update...")
    os._exit(0)
