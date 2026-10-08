# -*- coding: utf-8 -*-
"""Unit tests for the cron run-history store (定时任务运行历史)."""
from __future__ import annotations

from pathlib import Path

import pytest

from qwenpaw.app.crons.run_history import (
    MAX_RUNS_PER_JOB,
    JsonRunHistoryStore,
)


@pytest.fixture()
def store(tmp_path: Path) -> JsonRunHistoryStore:
    return JsonRunHistoryStore(tmp_path / "cron_runs.json", max_per_job=5)


def test_start_and_finish_roundtrip(store: JsonRunHistoryStore) -> None:
    rec = store.start_run("job-1", "run-1", trigger="manual")
    assert rec.status == "running"
    assert rec.finished_at is None

    store.finish_run(rec, "success")
    runs = store.get_runs("job-1")
    assert len(runs) == 1
    assert runs[0].status == "success"
    assert runs[0].trigger == "manual"
    assert runs[0].finished_at is not None
    assert runs[0].duration_ms is not None
    assert runs[0].duration_ms >= 0


def test_error_keeps_message(store: JsonRunHistoryStore) -> None:
    rec = store.start_run("job-2", "run-2")
    store.finish_run(rec, "error", error="ValueError('boom')")
    runs = store.get_runs("job-2")
    assert runs[0].status == "error"
    assert "boom" in (runs[0].error or "")


def test_newest_first_ordering(store: JsonRunHistoryStore) -> None:
    for i in range(3):
        rec = store.start_run("job-3", f"run-{i}")
        store.finish_run(rec, "success")
    runs = store.get_runs("job-3")
    # newest first: run-2 was started last
    assert [r.run_id for r in runs] == ["run-2", "run-1", "run-0"]


def test_ring_buffer_cap(store: JsonRunHistoryStore) -> None:
    for i in range(8):  # cap is 5
        rec = store.start_run("job-4", f"run-{i}")
        store.finish_run(rec, "success")
    runs = store.get_runs("job-4")
    assert len(runs) == 5
    # oldest dropped: remaining are runs 3..7, newest first
    assert [r.run_id for r in runs] == [
        "run-7",
        "run-6",
        "run-5",
        "run-4",
        "run-3",
    ]


def test_persistence_across_instances(
    store: JsonRunHistoryStore,
    tmp_path: Path,
) -> None:
    rec = store.start_run("job-5", "run-x")
    store.finish_run(rec, "success")

    # A fresh store instance reads the same file
    store2 = JsonRunHistoryStore(tmp_path / "cron_runs.json", max_per_job=5)
    runs = store2.get_runs("job-5")
    assert len(runs) == 1
    assert runs[0].run_id == "run-x"
    assert runs[0].status == "success"


def test_delete_runs(store: JsonRunHistoryStore) -> None:
    rec = store.start_run("job-6", "run-y")
    store.finish_run(rec, "success")
    store.delete_runs("job-6")
    assert store.get_runs("job-6") == []


def test_corrupt_file_starts_fresh(tmp_path: Path) -> None:
    bad = tmp_path / "cron_runs.json"
    bad.write_text("{not valid json", encoding="utf-8")
    store = JsonRunHistoryStore(bad)
    assert store.get_runs("any") == []
    # and it can still record new runs
    rec = store.start_run("any", "run-z")
    store.finish_run(rec, "success")
    assert len(store.get_runs("any")) == 1


def test_default_cap_matches_constant(tmp_path: Path) -> None:
    store = JsonRunHistoryStore(tmp_path / "runs.json")
    for i in range(MAX_RUNS_PER_JOB + 3):
        rec = store.start_run("job", f"run-{i}")
        store.finish_run(rec, "success")
    assert len(store.get_runs("job")) == MAX_RUNS_PER_JOB
