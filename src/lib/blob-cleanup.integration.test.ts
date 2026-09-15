import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getTursoClient } from "./turso";
import { BLOB_CLEANUP_SCHEMA } from "./blob-cleanup-schema";
import { DELETE } from "../app/api/songs/[id]/route";

test("failed cloud cleanup survives song deletion and repeated DELETE remains retryable", async () => {
  // Isolated local DB and no cloud credential: never touches production.
  await mkdir(".runtime", { recursive: true });
  const path = resolve(".runtime", `cleanup-test-${randomUUID()}.db`);
  process.env.TURSO_DATABASE_URL = pathToFileURL(path).href;
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const db = getTursoClient();
  const id = "11111111-1111-1111-1111-111111111111";
  try {
    await db.execute("CREATE TABLE songs (id TEXT PRIMARY KEY)");
    await db.execute(BLOB_CLEANUP_SCHEMA);
    await db.execute({ sql: "INSERT INTO songs VALUES (?)", args: [id] });
    const request = new Request(`http://localhost/api/songs/${id}`, { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id }) });
    assert.equal(response.status, 200);
    assert.equal((await db.execute("SELECT * FROM songs")).rows.length, 0);
    let row = (await db.execute("SELECT * FROM blob_cleanup_jobs")).rows[0];
    assert.equal(row.song_id, id);
    assert.equal(row.attempts, 1);
    assert.match(String(row.last_error), /token/i);
    assert(Number(row.run_after) > Number(row.created_at));
    assert.equal((await DELETE(request, { params: Promise.resolve({ id }) })).status, 200);
    row = (await db.execute("SELECT * FROM blob_cleanup_jobs")).rows[0];
    assert.equal(row.attempts, 2);
    assert.equal((await DELETE(request, { params: Promise.resolve({ id: "bad" }) })).status, 400);
  } finally { db.close(); await unlink(path); }
});
