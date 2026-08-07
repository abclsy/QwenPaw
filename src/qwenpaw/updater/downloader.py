# -*- coding: utf-8 -*-
"""Download and verify update packages."""
from __future__ import annotations

import hashlib
import logging
import os
import shutil
import zipfile
from pathlib import Path
from typing import Callable

import httpx

from ..constant import WORKING_DIR
from .checker import UpdateManifest

logger = logging.getLogger(__name__)

# Staging directory for downloaded update packages.
STAGING_DIR = WORKING_DIR / "updates" / "staging"


def _ensure_staging() -> Path:
    """Ensure the staging directory exists."""
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    return STAGING_DIR


def _compute_sha256(file_path: Path) -> str:
    """Compute the SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def download_update(
    manifest: UpdateManifest,
    progress_callback: Callable[[int, int], None] | None = None,
) -> Path | None:
    """Download the update package for the current platform.

    Args:
        manifest: Parsed update manifest.
        progress_callback: Optional callback(downloaded_bytes, total_bytes).

    Returns:
        Path to the downloaded zip file, or ``None`` on failure.
    """
    asset = manifest.current_platform
    if asset is None:
        logger.error("No update asset for platform: %s", _platform_name())
        return None

    staging = _ensure_staging()
    zip_name = f"小铁智友-{manifest.version}-{_platform_name()}.zip"
    zip_path = staging / zip_name

    # If already downloaded and verified, skip.
    if zip_path.exists() and asset.sha256:
        actual_hash = _compute_sha256(zip_path)
        if actual_hash == asset.sha256:
            logger.info("Update already downloaded and verified: %s", zip_path)
            return zip_path
        logger.warning("Cached zip hash mismatch, re-downloading")

    try:
        with httpx.stream(
            "GET",
            asset.url,
            follow_redirects=True,
            timeout=httpx.Timeout(30.0, read=None),
        ) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0

            with open(zip_path, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback:
                        progress_callback(downloaded, total or downloaded)

    except httpx.HTTPError as exc:
        logger.error("Failed to download update: %s", exc)
        zip_path.unlink(missing_ok=True)
        return None

    # Verify SHA256 if provided.
    if asset.sha256:
        actual_hash = _compute_sha256(zip_path)
        if actual_hash != asset.sha256:
            logger.error(
                "SHA256 mismatch: expected %s, got %s",
                asset.sha256,
                actual_hash,
            )
            zip_path.unlink(missing_ok=True)
            return None
        logger.info("Update package verified (SHA256 OK)")

    return zip_path


def _platform_name() -> str:
    """Return a short platform name for file naming."""
    if sys_platform == "darwin":
        return "mac"
    if sys_platform == "win32":
        return "win"
    return sys_platform


# Avoid importing sys at module level for the helper — use a local alias.
import sys as _sys  # noqa: E402

sys_platform = _sys.platform


def get_downloaded_update(
    manifest: UpdateManifest,
) -> Path | None:
    """Check if the update for the given manifest is already downloaded."""
    asset = manifest.current_platform
    if asset is None:
        return None

    staging = _ensure_staging()
    zip_name = f"小铁智友-{manifest.version}-{_platform_name()}.zip"
    zip_path = staging / zip_name

    if not zip_path.exists():
        return None

    if asset.sha256:
        actual_hash = _compute_sha256(zip_path)
        if actual_hash != asset.sha256:
            return None

    return zip_path


def cleanup_staging() -> None:
    """Remove all files from the staging directory."""
    if STAGING_DIR.is_dir():
        shutil.rmtree(STAGING_DIR, ignore_errors=True)
