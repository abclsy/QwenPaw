# -*- coding: utf-8 -*-
"""FastAPI routes for the auto-update feature."""
from __future__ import annotations

import logging
import threading
from enum import Enum
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..__version__ import __version__
from .checker import check_for_update, fetch_manifest, is_newer_version
from .downloader import download_update, get_downloaded_update, STAGING_DIR
from .applier import apply_update, restart_app

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/update", tags=["update"])


class UpdateStatus(str, Enum):
    IDLE = "idle"
    CHECKING = "checking"
    DOWNLOADING = "downloading"
    DOWNLOADED = "downloaded"
    APPLYING = "applying"
    ERROR = "error"


class UpdateState(BaseModel):
    status: UpdateStatus = UpdateStatus.IDLE
    current_version: str = __version__
    latest_version: str | None = None
    has_update: bool | None = None
    release_notes: str = ""
    download_progress: int = 0  # 0-100
    download_total: int = 0  # total bytes
    download_downloaded: int = 0  # downloaded bytes
    error: str = ""


_state_lock = threading.Lock()
_state = UpdateState()


def _get_state() -> UpdateState:
    with _state_lock:
        return _state.model_copy()


def _set_state(**kwargs: Any) -> UpdateState:
    global _state
    with _state_lock:
        _state = _state.model_copy(update=kwargs)
        return _state


@router.get("/status", summary="Get current update state")
async def get_update_status() -> dict[str, Any]:
    """Return the current update status, including version info and progress."""
    state = _get_state()
    return state.model_dump()


@router.post("/check", summary="Check for updates")
async def check_updates() -> dict[str, Any]:
    """Manually trigger an update check.

    Fetches the manifest from the update server and compares versions.
    """
    _set_state(status=UpdateStatus.CHECKING, error="")
    manifest, newer = check_for_update()

    if manifest is None:
        _set_state(status=UpdateStatus.ERROR, error="Failed to fetch update manifest")
        return _get_state().model_dump()

    # Check if already downloaded
    existing = get_downloaded_update(manifest)
    if existing:
        _set_state(
            status=UpdateStatus.DOWNLOADED,
            latest_version=manifest.version,
            has_update=newer,
            release_notes=manifest.release_notes_text,
        )
    else:
        _set_state(
            status=UpdateStatus.IDLE,
            latest_version=manifest.version,
            has_update=newer,
            release_notes=manifest.release_notes_text,
        )

    return _get_state().model_dump()


@router.post("/download", summary="Download the update package")
async def download_updates() -> dict[str, Any]:
    """Start downloading the update package in a background thread."""
    # First make sure we have a manifest
    if _get_state().latest_version is None:
        _set_state(status=UpdateStatus.CHECKING, error="")
        manifest, newer = check_for_update()
        if manifest is None:
            _set_state(status=UpdateStatus.ERROR, error="Failed to fetch update manifest")
            return _get_state().model_dump()
    else:
        manifest = fetch_manifest()
        if manifest is None:
            _set_state(status=UpdateStatus.ERROR, error="Failed to fetch update manifest")
            return _get_state().model_dump()

    # Check if already downloaded
    existing = get_downloaded_update(manifest)
    if existing:
        _set_state(status=UpdateStatus.DOWNLOADED, latest_version=manifest.version)
        return _get_state().model_dump()

    # Start download in background thread
    _set_state(
        status=UpdateStatus.DOWNLOADING,
        download_progress=0,
        download_downloaded=0,
        download_total=0,
        error="",
        latest_version=manifest.version,
    )

    def _download_thread() -> None:
        try:
            result = download_update(
                manifest,
                progress_callback=lambda done, total: _set_state(
                    download_downloaded=done,
                    download_total=total,
                    download_progress=int(done * 100 / total) if total else 0,
                ),
            )
            if result is not None:
                _set_state(
                    status=UpdateStatus.DOWNLOADED,
                    download_progress=100,
                    latest_version=manifest.version,
                )
            else:
                _set_state(
                    status=UpdateStatus.ERROR,
                    error="Download failed or verification error",
                )
        except Exception as exc:
            logger.exception("Update download failed")
            _set_state(status=UpdateStatus.ERROR, error=str(exc))

    thread = threading.Thread(target=_download_thread, daemon=True, name="update-download")
    thread.start()

    return _get_state().model_dump()


@router.post("/apply", summary="Apply the update and restart")
async def apply_updates() -> dict[str, Any]:
    """Apply the downloaded update and restart the application.

    This endpoint returns immediately; the actual replacement happens
    in a detached script after the current process exits.
    """
    if _get_state().latest_version is None:
        manifest, _ = check_for_update()
    else:
        manifest = fetch_manifest()

    if manifest is None:
        return {"success": False, "error": "No manifest available"}

    zip_path = get_downloaded_update(manifest)
    if zip_path is None:
        return {"success": False, "error": "Update package not downloaded"}

    _set_state(status=UpdateStatus.APPLYING)

    ok = apply_update(str(zip_path))
    if not ok:
        _set_state(status=UpdateStatus.ERROR, error="Failed to launch update script")
        return {"success": False, "error": "Failed to launch update script"}

    # Schedule restart after a short delay (allow HTTP response to be sent)
    def _restart() -> None:
        import time
        time.sleep(1.5)
        restart_app()

    threading.Thread(target=_restart, daemon=True, name="update-restart").start()

    return {"success": True, "message": "Update is being applied. The app will restart shortly."}
