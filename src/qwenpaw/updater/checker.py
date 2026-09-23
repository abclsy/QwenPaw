# -*- coding: utf-8 -*-
"""Version manifest fetching and comparison."""
from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from typing import Any

import httpx
from packaging.version import InvalidVersion, Version

from ..__version__ import __version__

logger = logging.getLogger(__name__)

# Default manifest URL — MinIO console download API for the manifest file.
DEFAULT_MANIFEST_URL = (
    "https://io.crec.cn:30090/api/v1/buckets/ai-client-package/objects/download?prefix=manifest.json"
)

# Request timeout for fetching manifest (seconds).
_MANIFEST_TIMEOUT = 15.0


@dataclass(frozen=True)
class PlatformAsset:
    """Downloadable asset for a specific platform."""

    url: str
    sha256: str
    size: int = 0


@dataclass(frozen=True)
class UpdateManifest:
    """Parsed manifest from the update server."""

    version: str
    date: str
    release_notes: dict[str, str] = field(default_factory=dict)
    platforms: dict[str, PlatformAsset] = field(default_factory=dict)
    min_app_version: str = "1.0.0"
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def current_platform(self) -> PlatformAsset | None:
        """Return the asset for the current platform."""
        key = sys.platform  # 'darwin' or 'win32'
        return self.platforms.get(key)

    @property
    def release_notes_text(self) -> str:
        """Return release notes in the user's language."""
        lang = "zh" if sys.platform == "darwin" else "zh"
        return self.release_notes.get(lang) or self.release_notes.get("en") or ""


def _parse_version(version: str) -> Any:
    """Parse a version string, returning the raw string on failure."""
    try:
        return Version(version)
    except InvalidVersion:
        return version


def is_newer_version(latest: str, current: str) -> bool | None:
    """Return True if *latest* is newer than *current*.

    Returns ``None`` when versions cannot be compared reliably.
    """
    parsed_latest = _parse_version(latest)
    parsed_current = _parse_version(current)
    if isinstance(parsed_latest, str) or isinstance(parsed_current, str):
        if latest == current:
            return False
        return None
    return parsed_latest > parsed_current


def fetch_manifest(
    manifest_url: str = DEFAULT_MANIFEST_URL,
) -> UpdateManifest | None:
    """Fetch and parse the update manifest from the server.

    Returns ``None`` if the fetch fails or the manifest is invalid.
    """
    try:
        resp = httpx.get(
            manifest_url,
            timeout=_MANIFEST_TIMEOUT,
            headers={"Accept": "application/json"},
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Failed to fetch update manifest: %s", exc)
        return None

    try:
        platforms: dict[str, PlatformAsset] = {}
        for plat_key, plat_data in (data.get("platforms") or {}).items():
            platforms[plat_key] = PlatformAsset(
                url=plat_data["url"],
                sha256=plat_data.get("sha256", ""),
                size=plat_data.get("size", 0),
            )

        return UpdateManifest(
            version=str(data.get("version", "")),
            date=str(data.get("date", "")),
            release_notes=data.get("releaseNotes") or {},
            platforms=platforms,
            min_app_version=str(data.get("minAppVersion", "1.0.0")),
            raw=data,
        )
    except (KeyError, TypeError) as exc:
        logger.warning("Failed to parse update manifest: %s", exc)
        return None


def check_for_update(
    manifest_url: str = DEFAULT_MANIFEST_URL,
) -> tuple[UpdateManifest | None, bool | None]:
    """Check if an update is available.

    Returns a tuple of ``(manifest, is_newer)`` where ``is_newer`` is
    ``True`` if a newer version exists, ``False`` if up-to-date, and
    ``None`` if the comparison is inconclusive.
    """
    manifest = fetch_manifest(manifest_url)
    if manifest is None:
        return (None, None)

    if not manifest.version:
        logger.warning("Update manifest has no version field")
        return (manifest, None)

    newer = is_newer_version(manifest.version, __version__)
    return (manifest, newer)
