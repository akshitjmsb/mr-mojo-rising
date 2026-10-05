"""Dedicated lightweight worker; shares Turso with Mojo without loading ML stems."""
from __future__ import annotations
import argparse
import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path
import requests

from dotenv import load_dotenv
from lesson_engine import codex_binary, extract, run

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
load_dotenv(ROOT / "mac-server" / ".env", override=True)
LOG = logging.getLogger("mojo.lessons")


class RemoteQueue:
    def __init__(self, url, token, owner):
        self.url = url.rstrip("/") + "/api/lessons/worker"
        self.token, self.owner = token, owner
    def call(self, action, **data):
        response = requests.post(self.url, headers={"Authorization": f"Bearer {self.token}"}, json={"owner": self.owner, "action": action, **data}, timeout=40)
        if response.status_code == 409: raise RuntimeError("This worker no longer owns the lesson.")
        if not response.ok: raise RuntimeError("Could not connect the lesson worker to Mojo.")
        return response.json()


def process_remote(queue, job):
    stop = threading.Event()
    def pulse():
        while not stop.wait(20):
            try: queue.call("heartbeat", available=True, id=job["id"])
            except Exception: LOG.warning("Could not refresh lesson heartbeat")
    heartbeat = threading.Thread(target=pulse, daemon=True); heartbeat.start()
    def progress(stage):
        queue.call("progress", id=job["id"], stage=stage)
        LOG.info("%s", stage)
    try:
        pack = extract(job["source_url"], job["transcript"] or "", job["description"] or "", progress)
        queue.call("complete", id=job["id"], pack=pack.model_dump(), title=pack.metadata.song.value or pack.source.title)
    except Exception as error:
        message = str(error) if isinstance(error, (RuntimeError, ValueError)) and len(str(error)) < 300 else "The lesson could not be extracted. Check the worker, then retry."
        queue.call("fail", id=job["id"], error=message)
        LOG.warning("Lesson extraction did not finish (%s)", type(error).__name__)
    finally:
        stop.set(); heartbeat.join(timeout=45)


class LocalDB:
    """Same SQL protocol for isolated development and queue recovery tests."""
    def __init__(self, path): self.path = path
    def execute(self, sql, args=()):
        with sqlite3.connect(self.path, timeout=30) as db:
            db.row_factory = sqlite3.Row
            return [dict(row) for row in db.execute(sql, args).fetchall()]


def database():
    url = os.getenv("TURSO_DATABASE_URL", "")
    if url.startswith("file:"): return LocalDB(url[5:])
    if not url: raise RuntimeError("Set TURSO_DATABASE_URL in .env.local.")
    from turso_db import get_client
    return get_client()


def ensure_schema(db):
    # Share the exact idempotent DDL with Next.js instead of maintaining two schemas.
    import re
    for sql in re.findall(r"`([^`]+)`", (ROOT / "src/lib/lesson-schema.ts").read_text()):
        db.execute(sql)


def recover(db):
    db.execute("""UPDATE lessons SET status=CASE WHEN attempts >= 2 THEN 'failed' ELSE 'queued' END,
      stage='Worker interrupted', error='The worker stopped before this lesson finished.', locked_by=NULL,
      updated_at=unixepoch() WHERE status='running' AND heartbeat_at < unixepoch()-120""")


def claim(db, owner):
    rows = db.execute("""UPDATE lessons SET status='running', locked_by=?, attempts=attempts+1,
      heartbeat_at=unixepoch(), updated_at=unixepoch(), error=NULL
      WHERE id=(SELECT id FROM lessons WHERE status='queued' ORDER BY created_at LIMIT 1)
      AND status='queued' RETURNING *""", [owner])
    return rows[0] if rows else None


def process(db, job, owner):
    stop = threading.Event()
    def pulse():
        while not stop.wait(20):
            try:
                db.execute("UPDATE lessons SET heartbeat_at=unixepoch() WHERE id=? AND locked_by=? AND status='running'", [job["id"], owner])
                db.execute("UPDATE lesson_workers SET heartbeat_at=unixepoch() WHERE id=?", [owner])
            except Exception: LOG.warning("Could not refresh lesson heartbeat")
    heartbeat = threading.Thread(target=pulse, daemon=True)
    heartbeat.start()
    def progress(stage):
        rows = db.execute("UPDATE lessons SET stage=?, updated_at=unixepoch() WHERE id=? AND locked_by=? AND status='running' RETURNING id", [stage, job["id"], owner])
        if not rows: raise RuntimeError("This worker no longer owns the lesson.")
        LOG.info("%s", stage)
    try:
        pack = extract(job["source_url"], job["transcript"] or "", job["description"] or "", progress)
        db.execute("""UPDATE lessons SET status='ready', stage='Ready to practice', pack_json=?, title=?,
          updated_at=unixepoch(), locked_by=NULL WHERE id=? AND locked_by=? AND status='running'""",
                   [pack.model_dump_json(), pack.metadata.song.value or pack.source.title, job["id"], owner])
    except Exception as error:
        # Only controlled engine errors go to clients; subprocess stderr is never included.
        message = str(error) if isinstance(error, (RuntimeError, ValueError)) and len(str(error)) < 300 else "The lesson could not be extracted. Check the worker, then retry."
        db.execute("UPDATE lessons SET status='failed', stage='Needs attention', error=?, locked_by=NULL, updated_at=unixepoch() WHERE id=? AND locked_by=?", [message, job["id"], owner])
        LOG.warning("Lesson extraction did not finish (%s)", type(error).__name__)
    finally:
        stop.set(); heartbeat.join(timeout=25)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--extract", help="Extract a public YouTube lesson to a local JSON file")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    if args.extract:
        if not args.output: parser.error("--extract requires --output")
        pack = extract(args.extract, progress=lambda stage: LOG.info("%s", stage))
        args.output.write_text(pack.model_dump_json(indent=2))
        return
    owner = str(uuid.uuid4())
    remote = RemoteQueue(os.environ["LESSON_APP_URL"], os.environ["LESSON_WORKER_TOKEN"], owner) if os.getenv("LESSON_APP_URL") and os.getenv("LESSON_WORKER_TOKEN") else None
    db = None if remote else database()
    if db: ensure_schema(db)
    while True:
        try:
            auth = run([codex_binary(), "login", "status"], timeout=15)
            available = "ChatGPT" in auth.stdout + auth.stderr
            message = "Codex subscription connected" if available else "Sign in to Codex with ChatGPT."
        except Exception:
            available, message = False, "Sign in to Codex with ChatGPT."
        try:
            if remote:
                remote.call("heartbeat", available=available)
                if available:
                    job = remote.call("claim").get("job")
                    if job: process_remote(remote, job)
                if args.once: break
                time.sleep(10)
                continue
            db.execute("INSERT INTO lesson_workers(id,available,message,heartbeat_at) VALUES(?,?,?,unixepoch()) ON CONFLICT(id) DO UPDATE SET available=excluded.available,message=excluded.message,heartbeat_at=unixepoch()", [owner, int(available), message])
            recover(db)
            if available:
                job = claim(db, owner)
                if job: process(db, job, owner)
        except Exception as error:
            LOG.warning("Worker connection needs attention (%s)", type(error).__name__)
        if args.once: break
        time.sleep(10)


if __name__ == "__main__": main()
