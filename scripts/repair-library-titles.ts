// Verified against the source upload titles. Metadata only; no audio processing.
import { mkdir, writeFile } from "node:fs/promises";
import { getTursoClient } from "../src/lib/turso";

const corrections = new Map([
  ["kky-bGlcM04", "Apun Bola Tu Meri Laila"],
  ["tNDWJ_KDkAc", "Last Kiss"],
  ["oUM-fttuDqw", "Sun Re Sajania"],
  ["6mI3DhfCvxs", "Neend Aati Nahin"],
  ["oInE3VjB3J4", "Mere Gaon Aaoge"],
]);

async function main() {
  const client = getTursoClient();
  const result = await client.execute("SELECT id,title,youtube_url FROM songs");
  const changes = result.rows.flatMap(row => {
    const video = new URL(String(row.youtube_url)).searchParams.get("v");
    const title = corrections.get(video ?? "");
    return title && title !== row.title ? [{ id: row.id, oldTitle: row.title, title }] : [];
  });
  console.log(changes);
  if (!process.argv.includes("--apply") || !changes.length) return;
  await mkdir(".runtime/backups", { recursive: true });
  await writeFile(`.runtime/backups/song-titles-${Date.now()}.json`, JSON.stringify(changes, null, 2));
  const tx = await client.transaction("write");
  try {
    for (const change of changes) {
      const updated = await tx.execute({
        sql: "UPDATE songs SET title = ?, updated_at = unixepoch() WHERE id = ? AND title = ?",
        args: [change.title, change.id, change.oldTitle],
      });
      if (updated.rowsAffected !== 1) throw new Error("Song changed since inspection; repair cancelled.");
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  console.log(`Updated ${changes.length} song names.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
