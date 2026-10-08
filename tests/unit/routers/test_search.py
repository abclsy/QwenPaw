# -*- coding: utf-8 -*-
"""Unit tests for global search (会话 + 文件双域搜索)."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from qwenpaw.app.routers.search import (
    _extract_text,
    _make_snippet,
    _search_chat_files,
    _search_workspace_files,
)


def _session_file(messages: list[dict]) -> dict:
    """Real-shape session state: {"agent": {"memory": {"content": [...]}}}."""
    return {
        "agent": {
            "name": "default",
            "memory": {"content": messages},
        }
    }


def test_extract_text_flat_string() -> None:
    assert _extract_text("你好 world") == "你好 world"


def test_extract_text_blocks() -> None:
    content = [{"type": "text", "text": "变更索赔"}, {"type": "text", "text": "28天"}]
    assert "变更索赔" in _extract_text(content)
    assert "28天" in _extract_text(content)


def test_extract_text_nested_wrapper() -> None:
    # real session files wrap content like [[msg, []]]
    inner = {"id": "m1", "role": "user", "content": [{"type": "text", "text": "验工计价"}]}
    content = [[inner, []]]
    assert "验工计价" in _extract_text(content)


def test_make_snippet_ellipsis() -> None:
    text = "a" * 200 + "needle" + "b" * 200
    s = _make_snippet(text, 200, 206)
    assert s.startswith("…") and s.endswith("…")
    assert "needle" in s


def _msg(role: str, text: str, ts: str = "2026-10-08 09:00:00") -> dict:
    return {
        "id": f"m-{role}-{text[:6]}",
        "role": role,
        "name": role,
        "content": [{"type": "text", "text": text}],
        "timestamp": ts,
    }


class TestChatSearch:
    def test_finds_user_message(self, tmp_path: Path) -> None:
        sf = tmp_path / "default_123.json"
        sf.write_text(
            json.dumps(
                _session_file(
                    [
                        _msg("user", "帮我写个变更索赔函"),
                        _msg("assistant", "好的，以下是模板……"),
                    ]
                ),
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        hits = _search_chat_files(
            tmp_path, re.compile(re.escape("变更索赔"), re.IGNORECASE)
        )
        assert len(hits) == 1
        assert hits[0].domain == "chat"
        assert hits[0].session_id == "default_123"
        assert hits[0].role == "user"
        assert "变更索赔" in hits[0].snippet

    def test_empty_query_no_hits(self, tmp_path: Path) -> None:
        sf = tmp_path / "default_1.json"
        sf.write_text(
            json.dumps(_session_file([_msg("user", "hello")]), ensure_ascii=False),
            encoding="utf-8",
        )
        hits = _search_chat_files(tmp_path, re.compile(re.escape("zzz"), re.IGNORECASE))
        assert hits == []

    def test_corrupt_file_skipped(self, tmp_path: Path) -> None:
        (tmp_path / "bad.json").write_text("{corrupt", encoding="utf-8")
        sf = tmp_path / "good.json"
        sf.write_text(
            json.dumps(_session_file([_msg("user", "target hit")]), ensure_ascii=False),
            encoding="utf-8",
        )
        hits = _search_chat_files(tmp_path, re.compile(re.escape("target"), re.IGNORECASE))
        assert len(hits) == 1

    def test_case_insensitive(self, tmp_path: Path) -> None:
        sf = tmp_path / "s.json"
        sf.write_text(
            json.dumps(_session_file([_msg("user", "FIDIC Contract")]), ensure_ascii=False),
            encoding="utf-8",
        )
        hits = _search_chat_files(tmp_path, re.compile(re.escape("fidic"), re.IGNORECASE))
        assert len(hits) == 1


class TestFileSearch:
    def test_finds_md_file(self, tmp_path: Path) -> None:
        (tmp_path / "notes.md").write_text(
            "# 会议纪要\n变更索赔四要素必须齐备", encoding="utf-8"
        )
        hits = _search_workspace_files(
            tmp_path, re.compile(re.escape("四要素"), re.IGNORECASE)
        )
        assert len(hits) == 1
        assert hits[0].domain == "file"
        assert hits[0].path == "notes.md"

    def test_skips_binary_and_oversized(self, tmp_path: Path) -> None:
        (tmp_path / "blob.bin").write_bytes(b"\x00\x01target")
        big = tmp_path / "big.txt"
        big.write_text("target " * 100_000, encoding="utf-8")  # ~700KB
        hits = _search_workspace_files(
            tmp_path, re.compile(re.escape("target"), re.IGNORECASE)
        )
        assert hits == []

    def test_skips_node_modules(self, tmp_path: Path) -> None:
        nm = tmp_path / "node_modules"
        nm.mkdir()
        (nm / "dep.js").write_text("const target = 1", encoding="utf-8")
        hits = _search_workspace_files(
            tmp_path, re.compile(re.escape("target"), re.IGNORECASE)
        )
        assert hits == []

    def test_score_counts_occurrences(self, tmp_path: Path) -> None:
        (tmp_path / "doc.md").write_text("索赔 索赔 索赔", encoding="utf-8")
        hits = _search_workspace_files(
            tmp_path, re.compile(re.escape("索赔"), re.IGNORECASE)
        )
        assert hits[0].score == 3
