# -*- coding: utf-8 -*-
"""Run-history store for cron jobs (定时任务运行历史).

Persists the most recent executions per job to a JSON file next to
jobs.json so the frontend can render a run timeline with failure
reasons (parity with WorkBuddy 5.7.0/5.7.5's task run history).

Design:
- One JSON file, {"version": 1, "runs": {job_id: [RunRecord, ...]}}
- Ring buffer: keeps the newest MAX_RUNS_PER_JOB records per job
- Atomic writes (tmp + move), same pattern as JsonJobRepository
- Thread-free like the rest of the crons package (single event loop)
"""
from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

MAX_RUNS_PER_JOB = 50


class RunRecord(BaseModel):
    """One execution of a cron job."""

    run_id: str
    job_id: str
    status: str  # success | error | running | cancelled
    started_at: datetime
    finished_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    trigger: str = "scheduled"  # scheduled | manual


class RunsFile(BaseModel):
    version: int = 1
    runs: dict[str, list[RunRecord]] = Field(default_factory=dict)


class JsonRunHistoryStore:
    """Persistent run-history ring buffer for cron jobs."""

    def __init__(self, path: Path | str, max_per_job: int = MAX_RUNS_PER_JOB):
        self._path = Path(path)
        self._max = max_per_job
        self._cache: dict[str, list[RunRecord]] = {}
        self._loaded = False
        self._dirty = False

    # ----- persistence -----

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            if self._path.exists():
                data = json.loads(self._path.read_text(encoding="utf-8"))
                runs_file = RunsFile.model_validate(data)
                self._cache = runs_file.runs
        except Exception as e:  # pylint: disable=broad-except
            logger.warning(
                "run history load failed (%s), starting fresh: %s",
                self._path,
                e,
            )
            self._cache = {}

    def _flush(self) -> None:
        """Atomically persist the cache. Callers keep it best-effort."""
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self._path.with_suffix(".tmp")
            payload = RunsFile(runs=self._cache).model_dump(mode="json")
            tmp_path.write_text(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                ),
                encoding="utf-8",
            )
            shutil.move(str(tmp_path), str(self._path))
            self._dirty = False
        except Exception as e:  # pylint: disable=broad-except
            logger.warning("run history flush failed: %s", e)

    # ----- API -----

    def start_run(
        self,
        job_id: str,
        run_id: str,
        trigger: str = "scheduled",
    ) -> RunRecord:
        """Record the start of an execution and return the record."""
        self._ensure_loaded()
        record = RunRecord(
            run_id=run_id,
            job_id=job_id,
            status="running",
            started_at=datetime.now(timezone.utc),
            trigger=trigger,
        )
        bucket = self._cache.setdefault(job_id, [])
        bucket.append(record)
        # ring buffer: drop oldest beyond the cap
        del bucket[: max(0, len(bucket) - self._max)]
        self._dirty = True
        self._flush()
        return record

    def finish_run(
        self,
        record: RunRecord,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        """Complete a running record in place and persist."""
        record.status = status
        record.finished_at = datetime.now(timezone.utc)
        delta = record.finished_at - record.started_at
        record.duration_ms = int(delta.total_seconds() * 1000)
        record.error = error
        self._dirty = True
        self._flush()

    def get_runs(
        self,
        job_id: str,
        limit: int = 50,
    ) -> list[RunRecord]:
        """Newest-first run records for a job."""
        self._ensure_loaded()
        bucket = self._cache.get(job_id, [])
        # newest first
        return list(reversed(bucket[-limit:]))

    def delete_runs(self, job_id: str) -> None:
        """Drop history when a job is deleted."""
        self._ensure_loaded()
        if job_id in self._cache:
            del self._cache[job_id]
            self._dirty = True
            self._flush()

    def flush(self) -> None:
        """Persist any pending changes."""
        if self._dirty:
            self._flush()
