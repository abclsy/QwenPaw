# -*- coding: utf-8 -*-
"""Global search API (全局搜索): chat history + workspace text files.

Parity with WorkBuddy 5.7.0's global search. One endpoint searches two
domains within the active agent's scope:

1. Chat sessions — scans every ``sessions/*.json`` file, matching
   user/assistant text turns; returns session id, role, timestamp and
   a snippet around the first match.

2. Workspace text files — walks the workspace dir for
   md/txt/json/csv/py/js/ts/html (small, text-like files only), each
   capped at SEARCHABLE_FILE_LIMIT bytes; returns path + snippet.

Synchronous scan is fine at this scale (hundreds of session files,
tens of small text files; binary/oversized files skipped).
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from ..agent_context import get_agent_for_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])

MAX_RESULTS_PER_DOMAIN = 20
SNIPPET_CONTEXT = 60  # chars each side of the match
SEARCHABLE_SUFFIXES = {
    ".md", ".txt", ".json", ".csv", ".py", ".js", ".ts",
    ".html", ".htm", ".yml", ".yaml", ".xml", ".log",
}
SEARCHABLE_FILE_LIMIT = 512 * 1024  # skip files > 512KB
SKIP_DIRS = {"node_modules", "__pycache__", ".git", "sessions", "media"}



class SearchHit(BaseModel):
    domain: str  # "chat" | "file"
    # chat: session_id / role / timestamp; file: path
    session_id: Optional[str] = None
    agent_name: Optional[str] = None
    role: Optional[str] = None
    timestamp: Optional[str] = None
    path: Optional[str] = None
    snippet: str
    score: int = 1  # occurrences found


class SearchResponse(BaseModel):
    query: str
    chats: list[SearchHit]
    files: list[SearchHit]


def _extract_text(content: Any, _depth: int = 0) -> str:
    """Flatten Msg.content (str | [{type,text}] | nested) to text.

    Real session files exhibit several shapes: plain str, block lists
    ``[{"type":"text","text":...}]``, and tuple-wrapped lists like
    ``[[msg_dict, []]]`` where msg_dict itself carries a nested
    ``content``. Recurse (bounded) until text blocks are found.
    """
    if _depth > 3:
        return ""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict):
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
            nested = block.get("content")
            if nested is not None:
                sub = _extract_text(nested, _depth + 1)
                if sub:
                    parts.append(sub)
        elif isinstance(block, list):
            sub = _extract_text(block, _depth + 1)
            if sub:
                parts.append(sub)
    return " ".join(p for p in parts if p)


def _make_snippet(text: str, match_start: int, match_end: int) -> str:
    left = max(0, match_start - SNIPPET_CONTEXT)
    right = min(len(text), match_end + SNIPPET_CONTEXT)
    snippet = text[left:right].replace("\n", " ").strip()
    prefix = "…" if left > 0 else ""
    suffix = "…" if right < len(text) else ""
    return f"{prefix}{snippet}{suffix}"




def _search_chat_files(sessions_dir: Path, pattern: re.Pattern) -> list[SearchHit]:
    hits: list[SearchHit] = []
    if not sessions_dir.is_dir():
        return hits
    for sf in sorted(sessions_dir.glob("*.json"), reverse=True):
        if len(hits) >= MAX_RESULTS_PER_DOMAIN:
            break
        try:
            data = json.loads(sf.read_text(encoding="utf-8", errors="ignore"))
        except Exception:  # noqa: BLE001 - corrupt/oversized files skipped
            continue
        agent = data.get("agent") if isinstance(data, dict) else None
        if not isinstance(agent, dict):
            continue
        memory = agent.get("memory")
        if not isinstance(memory, dict):
            continue
        content = memory.get("content")
        if not isinstance(content, list):
            continue
        session_id = sf.stem
        agent_name = agent.get("name")
        session_hits = 0
        best: Optional[SearchHit] = None
        for entry in content:
            # Real session files store entries as [msg_dict, extra]
            # tuples (agentscope memory format); plain dicts also occur.
            msg = entry[0] if (
                isinstance(entry, list)
                and entry
                and isinstance(entry[0], dict)
            ) else entry
            if not isinstance(msg, dict):
                continue
            role = msg.get("role") or msg.get("name") or "?"
            text = _extract_text(msg.get("content"))
            if not text:
                continue
            m = pattern.search(text)
            if not m:
                continue
            session_hits += 1
            if best is None or role == "user":
                best = SearchHit(
                    domain="chat",
                    session_id=session_id,
                    agent_name=agent_name,
                    role=role,
                    timestamp=msg.get("timestamp"),
                    snippet=_make_snippet(text, m.start(), m.end()),
                    score=session_hits,
                )
                if role == "user":
                    break
        if best is not None:
            best.score = session_hits
            hits.append(best)
    return hits


def _search_workspace_files(
    workspace_dir: Path,
    pattern: re.Pattern,
) -> list[SearchHit]:
    hits: list[SearchHit] = []
    if not workspace_dir.is_dir():
        return hits
    for path in sorted(workspace_dir.rglob("*")):
        if len(hits) >= MAX_RESULTS_PER_DOMAIN:
            break
        if not path.is_file():
            continue
        parts = set(p.name for p in path.parents if p != workspace_dir)
        if parts & SKIP_DIRS:
            continue
        if path.suffix.lower() not in SEARCHABLE_SUFFIXES:
            continue
        try:
            if path.stat().st_size > SEARCHABLE_FILE_LIMIT:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:  # noqa: BLE001
            continue
        count = len(pattern.findall(text))
        if not count:
            continue
        m = pattern.search(text)
        assert m is not None
        hits.append(
            SearchHit(
                domain="file",
                path=str(path.relative_to(workspace_dir)),
                snippet=_make_snippet(text, m.start(), m.end()),
                score=count,
            ),
        )
    return hits


@router.get("", response_model=SearchResponse)
async def global_search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    agent_id: Optional[str] = Query(None),
) -> SearchResponse:
    """Search chat history + workspace files for the active agent."""
    workspace = await get_agent_for_request(request, agent_id=agent_id)
    query = q.strip()
    if not query:
        return SearchResponse(query=query, chats=[], files=[])
    # case-insensitive literal match; escape user input
    pattern = re.compile(re.escape(query), re.IGNORECASE)

    workspace_dir = Path(workspace.workspace_dir)
    sessions_dir = workspace_dir / "sessions"

    # keep the event loop responsive: run scans in a worker thread
    chats, files = await asyncio.to_thread(
        _scan_all, sessions_dir, workspace_dir, pattern,
    )
    return SearchResponse(query=query, chats=chats, files=files)


def _scan_all(
    sessions_dir: Path,
    workspace_dir: Path,
    pattern: re.Pattern,
) -> tuple[list[SearchHit], list[SearchHit]]:
    try:
        chats = _search_chat_files(sessions_dir, pattern)
    except Exception as e:  # noqa: BLE001
        logger.warning("search: chat scan failed: %s", e)
        chats = []
    try:
        files = _search_workspace_files(workspace_dir, pattern)
    except Exception as e:  # noqa: BLE001
        logger.warning("search: file scan failed: %s", e)
        files = []
    return chats, files
