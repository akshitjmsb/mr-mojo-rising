/** Explicit reviewed targets only. Back up bytes locally before --apply deletes cloud copies. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { list } from "@vercel/blob";
import { getTursoClient } from "../src/lib/turso";
import { BLOB_CLEANUP_SCHEMA } from "../src/lib/blob-cleanup-schema";
import { retryBlobCleanup } from "../src/lib/blob-cleanup";
import { songBlobPrefix } from "../src/lib/blob-cleanup-core";

const ids = ["119d33b1-9e5d-44bd-b93a-f37c9ccebe63", "36ca35b1-003a-4597-8af4-c2eaec7206f8", "5a39646f-8c51-4de3-becf-702414aa2b5c", "8cc21b9f-9db9-4447-9675-68ae32d9a2a2", "9e011e56-4c57-4a7e-a366-b8a131419f75"];
async function main() {
  const db = getTursoClient();
  const apply = process.argv.includes("--apply");
  const backup = ".runtime/storage-cleanup-2026-09-15";
  try {
    let count = 0, bytes = 0;
    for (const id of ids) {
      assert.equal((await db.execute({ sql: "SELECT id FROM songs WHERE id = ?", args: [id] })).rows.length, 0);
      assert.equal((await db.execute({ sql: "SELECT id FROM processing_jobs WHERE song_id = ?", args: [id] })).rows.length, 0);
      const prefix = songBlobPrefix(id);
      const result = await list({ prefix, limit: 1000 });
      assert(!result.hasMore, "Review unexpectedly large inventory first");
      const manifest = [];
      for (const blob of result.blobs) {
        assert(blob.pathname.startsWith(prefix));
        count++; bytes += blob.size;
        if (!apply) continue;
        const response = await fetch(blob.url, { signal: AbortSignal.timeout(60000) });
        assert(response.ok);
        const data = Buffer.from(await response.arrayBuffer());
        assert.equal(data.length, blob.size);
        const sha256 = createHash("sha256").update(data).digest("hex");
        await mkdir(`${backup}/${id}`, { recursive: true });
        await writeFile(`${backup}/${id}/${sha256}.bin`, data);
        manifest.push({ pathname: blob.pathname, url: blob.url, size: blob.size, sha256 });
      }
      if (apply && manifest.length) await writeFile(`${backup}/${id}/manifest.json`, JSON.stringify(manifest, null, 2));
    }
    console.log({ files: count, bytes, backedUp: apply });
    if (!apply) return;
    await db.execute(BLOB_CLEANUP_SCHEMA);
    for (const id of ids) {
      const tx = await db.transaction("write");
      try {
        assert.equal((await tx.execute({ sql: "SELECT id FROM songs WHERE id = ?", args: [id] })).rows.length, 0);
        await tx.execute({ sql: "INSERT INTO blob_cleanup_jobs (song_id) VALUES (?) ON CONFLICT(song_id) DO NOTHING", args: [id] });
        await tx.commit();
      } finally { tx.close(); }
      await retryBlobCleanup(id);
      assert.equal((await list({ prefix: songBlobPrefix(id), limit: 1 })).blobs.length, 0, "Cleanup remains pending");
    }
    console.log("Verified orphan cloud files removed; local backups retained.");
  } finally { db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
