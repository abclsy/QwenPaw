# -*- coding: utf-8 -*-
from pathlib import Path
from urllib.parse import unquote
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from starlette.responses import FileResponse

router = APIRouter(prefix="/files", tags=["files"])

# Back-button overlay injected into every HTML preview.
# Clicking it calls history.back(); if there is no history it falls back to
# window.close() (for new-window cases, though WKWebView won't use it).
_BACK_BUTTON_SNIPPET = """
<style>
  #__crecpaw_back {
    position: fixed; top: 12px; left: 12px; z-index: 2147483647;
    background: rgba(25,97,172,0.90); color: #fff;
    border: none; border-radius: 6px;
    padding: 6px 14px; font-size: 13px; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
    display: flex; align-items: center; gap: 6px;
  }
  #__crecpaw_back:hover { background: #1961AC; }
</style>
<button id="__crecpaw_back" onclick="history.length>1?history.back():window.close()">
  &#8592; 返回
</button>
"""


def _inject_back_button(html_bytes: bytes) -> bytes:
    """Inject a floating back-button into the HTML body."""
    html = html_bytes.decode("utf-8", errors="replace")
    tag = _BACK_BUTTON_SNIPPET
    # Try to insert right after <body ...> tag; fall back to prepend.
    import re
    match = re.search(r"(<body[^>]*>)", html, re.IGNORECASE)
    if match:
        pos = match.end()
        html = html[:pos] + tag + html[pos:]
    else:
        html = tag + html
    return html.encode("utf-8")


@router.api_route(
    "/preview/{filepath:path}",
    methods=["GET", "HEAD"],
    summary="Preview file",
)
async def preview_file(
    filepath: str,
    request: Request,
):
    """Preview file.

    For HTML files, returns the content inline (no Content-Disposition header)
    so that WKWebView / browsers render it directly.  A floating "← 返回"
    button is injected so the user can navigate back to the chat page.

    All other file types are served as downloads (Content-Disposition: attachment).
    """
    normalized = unquote(filepath)

    # Tolerate duplicated preview prefix from some clients, e.g.
    # /api/files/preview/api/files/preview/C%3A/Users/...
    while True:
        trimmed = normalized.lstrip("/")
        prefix = "api/files/preview/"
        if trimmed.startswith(prefix):
            normalized = trimmed[len(prefix):]
            continue
        break

    # Normalize /C:/... to C:/... on Windows.
    if (
        len(normalized) >= 4
        and normalized[0] == "/"
        and normalized[2] == ":"
        and normalized[1].isalpha()
    ):
        normalized = normalized[1:]

    path = Path(normalized)
    if not path.is_absolute():
        path = Path("/" + normalized)
    path = path.resolve()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    # ── HTML files: render inline with a back-button overlay ──
    if path.suffix.lower() in (".html", ".htm"):
        if request.method == "HEAD":
            return HTMLResponse(content="", status_code=200)
        raw = path.read_bytes()
        injected = _inject_back_button(raw)
        return HTMLResponse(
            content=injected.decode("utf-8", errors="replace"),
            status_code=200,
        )

    # ── All other files: attachment download ──
    return FileResponse(path, filename=path.name)
