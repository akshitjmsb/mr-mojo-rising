"""Tiny synchronous Turso/libSQL client wrapper.

Talks to the Turso HTTP API directly with `requests` so we don't need to
install the libsql Python driver (which requires native bindings). The HTTP
endpoint accepts JSON-encoded statement batches and returns rows in column-
oriented form; we normalize them to dicts of {column_name: value}.

This module is intentionally minimal — it exposes `execute()`, `query_all()`,
`query_one()`, and the queue helpers `claim_next_job()` /
`requeue_stale_jobs()`. Callers should pass parameterized SQL with `?`
placeholders and an args list/tuple.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any, Iterable, Optional

import requests


def _http_url(turso_url: str) -> str:
    """Convert a libsql:// URL to the HTTP endpoint."""
    if turso_url.startswith("libsql://"):
        return "https://" + turso_url[len("libsql://"):] + "/v2/pipeline"
    if turso_url.startswith("https://"):
        return turso_url.rstrip("/") + "/v2/pipeline"
    raise ValueError(f"Unsupported Turso URL: {turso_url}")


def _to_argspec(value: Any) -> dict:
    """Encode a Python value as a libSQL HTTP `value` object."""
    if value is None:
        return {"type": "null", "value": None}
    if isinstance(value, bool):
        # SQLite has no boolean — store as integer.
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, (bytes, bytearray)):
        import base64
        return {"type": "blob", "base64": base64.b64encode(bytes(value)).decode()}
    return {"type": "text", "value": str(value)}


def _decode_value(v: dict) -> Any:
    if v is None:
        return None
    t = v.get("type")
    val = v.get("value")
    if t == "null":
        return None
    if t == "integer":
        try:
            return int(val)
        except (TypeError, ValueError):
            return val
    if t == "float":
        try:
            return float(val)
        except (TypeError, ValueError):
            return val
    return val


class TursoClient:
    """Minimal pipeline client. One instance can be shared across threads
    (requests.Session is thread-safe for simple GET/POST)."""

    def __init__(self, url: str, auth_token: Optional[str] = None):
        self.endpoint = _http_url(url)
        self.auth_token = auth_token
        self.session = requests.Session()

    def _post(self, requests_payload: list[dict]) -> list[dict]:
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        body = {"requests": requests_payload}
        resp = self.session.post(self.endpoint, json=body, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])

    def execute(self, sql: str, args: Iterable[Any] = ()) -> list[dict]:
        """Run one statement and return the rows as a list of dicts."""
        payload = [
            {
                "type": "execute",
                "stmt": {
                    "sql": sql,
                    "args": [_to_argspec(a) for a in args],
                },
            },
            {"type": "close"},
        ]
        results = self._post(payload)
        if not results:
            return []
        first = results[0]
        if first.get("type") != "ok":
            err = first.get("error") or {}
            raise RuntimeError(f"Turso error: {err.get('message') or first}")
        response = first.get("response", {})
        result = response.get("result", {})
        cols = [c.get("name") for c in result.get("cols", [])]
        rows_raw = result.get("rows", [])
        return [
            {col: _decode_value(val) for col, val in zip(cols, row)}
            for row in rows_raw
        ]

    def execute_batch(self, statements: list[tuple[str, Iterable[Any]]]) -> list[list[dict]]:
        """Run multiple statements in one HTTP round-trip (transactional)."""
        payload: list[dict] = [{"type": "execute", "stmt": {"sql": "BEGIN", "args": []}}]
        for sql, args in statements:
            payload.append(
                {
                    "type": "execute",
                    "stmt": {
                        "sql": sql,
                        "args": [_to_argspec(a) for a in args],
                    },
                }
            )
        payload.append({"type": "execute", "stmt": {"sql": "COMMIT", "args": []}})
        payload.append({"type": "close"})
        results = self._post(payload)
        out: list[list[dict]] = []
        # skip BEGIN/COMMIT results
        for r in results[1:-2]:
            if r.get("type") != "ok":
                raise RuntimeError(f"Turso batch error: {r.get('error')}")
            response = r.get("response", {})
            result = response.get("result", {})
            cols = [c.get("name") for c in result.get("cols", [])]
            rows_raw = result.get("rows", [])
            out.append(
                [
                    {col: _decode_value(val) for col, val in zip(cols, row)}
                    for row in rows_raw
                ]
            )
        return out

    def query_one(self, sql: str, args: Iterable[Any] = ()) -> Optional[dict]:
        rows = self.execute(sql, args)
        return rows[0] if rows else None


_client: Optional[TursoClient] = None


def get_client() -> TursoClient:
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("TURSO_DATABASE_URL")
    token = os.environ.get("TURSO_AUTH_TOKEN")
    if not url:
        raise RuntimeError("TURSO_DATABASE_URL is not set")
    _client = TursoClient(url, token)
    return _client


def new_id() -> str:
    return str(uuid.uuid4())


def now_unix() -> int:
    return int(time.time())


# ----- Queue helpers (replace the Postgres RPC functions) -----


def ensure_worker_status_table() -> None:
    client = get_client()
    client.execute(
        """CREATE TABLE IF NOT EXISTS worker_status (
           worker_id TEXT PRIMARY KEY,
           status TEXT NOT NULL DEFAULT 'idle'
             CHECK (status IN ('starting', 'idle', 'running', 'stopped')),
           current_job_id TEXT,
           current_song_id TEXT,
           started_at INTEGER NOT NULL DEFAULT (unixepoch()),
           heartbeat_at INTEGER NOT NULL DEFAULT (unixepoch()),
           updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )"""
    )
    client.execute(
        """CREATE INDEX IF NOT EXISTS worker_status_heartbeat_idx
           ON worker_status (heartbeat_at)"""
    )


def update_worker_status(
    worker_id: str,
    status: str,
    *,
    current_job_id: str | None = None,
    current_song_id: str | None = None,
) -> None:
    client = get_client()
    client.execute(
        """INSERT INTO worker_status
             (worker_id, status, current_job_id, current_song_id)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(worker_id) DO UPDATE SET
             status = excluded.status,
             current_job_id = excluded.current_job_id,
             current_song_id = excluded.current_song_id,
             heartbeat_at = unixepoch(),
             updated_at = unixepoch()""",
        [worker_id, status, current_job_id, current_song_id],
    )


def touch_worker_status(worker_id: str) -> None:
    client = get_client()
    client.execute(
        """UPDATE worker_status
           SET heartbeat_at = unixepoch(),
               updated_at = unixepoch()
           WHERE worker_id = ?""",
        [worker_id],
    )


def claim_next_job(worker_id: str) -> Optional[dict]:
    """Atomically claim the next ready job; returns the row or None."""
    client = get_client()
    candidate = client.query_one(
        """SELECT * FROM processing_jobs
           WHERE status IN ('queued', 'retryable')
             AND run_after <= unixepoch()
           ORDER BY run_after ASC, created_at ASC
           LIMIT 1""",
    )
    if not candidate:
        return None

    job_id = candidate["id"]
    previous_status = candidate["status"]

    # Guarded UPDATE. If another worker raced us, the WHERE clause matches no
    # rows and we return None.
    rows = client.execute(
        """UPDATE processing_jobs
           SET status = 'running',
               locked_by = ?,
               locked_at = unixepoch(),
               heartbeat_at = unixepoch(),
               started_at = COALESCE(started_at, unixepoch()),
               attempt_count = attempt_count + 1,
               error_code = NULL,
               updated_at = unixepoch()
           WHERE id = ? AND status = ?
           RETURNING *""",
        [worker_id, job_id, previous_status],
    )
    return rows[0] if rows else None


def requeue_stale_jobs(timeout_seconds: int) -> list[dict]:
    """Recover jobs whose worker stopped sending heartbeats."""
    client = get_client()
    stale = client.execute(
        """SELECT id, attempt_count, max_attempts, last_error, error_code
           FROM processing_jobs
           WHERE status = 'running'
             AND heartbeat_at IS NOT NULL
             AND heartbeat_at < unixepoch() - ?""",
        [timeout_seconds],
    )

    recovered: list[dict] = []
    for row in stale:
        job_id = row["id"]
        attempt_count = row.get("attempt_count") or 0
        max_attempts = row.get("max_attempts") or 3
        last_error = row.get("last_error") or "Worker heartbeat timed out"
        error_code = row.get("error_code") or "heartbeat_timeout"
        exhausted = attempt_count >= max_attempts

        if exhausted:
            updated = client.execute(
                """UPDATE processing_jobs
                   SET status = 'failed',
                       locked_by = NULL,
                       locked_at = NULL,
                       heartbeat_at = NULL,
                       last_error = ?,
                       error_code = ?,
                       finished_at = unixepoch(),
                       updated_at = unixepoch()
                   WHERE id = ?
                   RETURNING *""",
                [last_error, error_code, job_id],
            )
        else:
            backoff = min(300, max(15, (2 ** min(attempt_count, 10)) * 5))
            updated = client.execute(
                """UPDATE processing_jobs
                   SET status = 'retryable',
                       run_after = unixepoch() + ?,
                       locked_by = NULL,
                       locked_at = NULL,
                       heartbeat_at = NULL,
                       last_error = ?,
                       error_code = ?,
                       updated_at = unixepoch()
                   WHERE id = ?
                   RETURNING *""",
                [backoff, last_error, error_code, job_id],
            )
        if updated:
            recovered.append(updated[0])
    return recovered
