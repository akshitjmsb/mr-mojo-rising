import { del, list } from "@vercel/blob";
import { execute, queryAll, queryOne } from "./queries";
import { cleanDeletedSong } from "./blob-cleanup-core";

export async function retryBlobCleanup(songId?: string) {
  const jobs = await queryAll<{ song_id: string; age: number }>(
    `SELECT song_id, unixepoch() - created_at AS age FROM blob_cleanup_jobs
     WHERE ${songId ? "song_id = ?" : "run_after <= unixepoch()"}
     ORDER BY run_after LIMIT 2`, songId ? [songId] : [],
  );
  let deletedFiles = 0;
  for (const job of jobs) {
    try {
      const removed = await cleanDeletedSong(job.song_id, {
        songExists: async () => !!await queryOne("SELECT id FROM songs WHERE id = ?", [job.song_id]),
        list: (prefix, cursor) => list({ prefix, cursor, limit: 1000 }),
        remove: urls => del(urls),
      });
      deletedFiles += removed;
      // Verify empty on a later pass, after in-flight worker uploads have stopped.
      // Keep tombstones for 24h to catch delayed uploads and partial deletions.
      if (removed === 0 && job.age >= 86400) {
        await execute("DELETE FROM blob_cleanup_jobs WHERE song_id = ?", [job.song_id]);
      } else {
        await execute(`UPDATE blob_cleanup_jobs SET run_after = unixepoch() + ?,
          attempts = attempts + 1, last_error = NULL WHERE song_id = ?`,
          [job.age < 300 ? 60 : 3600, job.song_id]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await execute(`UPDATE blob_cleanup_jobs SET run_after = unixepoch() + 60,
        attempts = attempts + 1, last_error = ? WHERE song_id = ?`, [message.slice(0, 500), job.song_id]);
      console.error("[blob-cleanup] retry scheduled", { songId: job.song_id, error: message });
    }
  }
  return { checked: jobs.length, deleted_files: deletedFiles };
}
