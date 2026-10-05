import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";
import { ensureLessons } from "@/lib/lesson-store";
import { parseLessonInput } from "@/lib/lesson-input";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await ensureLessons();
    const db = getTursoClient();
    const [lessons, worker] = await Promise.all([
      db.execute("SELECT id, source_url, title, status, stage, error, created_at, updated_at FROM lessons ORDER BY created_at DESC LIMIT 50"),
      db.execute("SELECT available, message FROM lesson_workers WHERE heartbeat_at > unixepoch() - 90 ORDER BY available DESC, heartbeat_at DESC LIMIT 1"),
    ]);
    return NextResponse.json({ lessons: lessons.rows, worker: worker.rows[0] ?? { available: 0, message: "Start the lesson worker on your Mac." } });
  } catch { return NextResponse.json({ error: "Lesson storage is unavailable. Try again shortly." }, { status: 503 }); }
}

export async function POST(request: Request) {
  let input;
  try {
    // Read a bounded body even when the client omits Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Add a lesson.");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 700000) { await reader.cancel(); throw new Error("This lesson input is too large."); }
      chunks.push(chunk.value);
    }
    input = parseLessonInput(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid input." }, { status: 400 }); }
  try {
    await ensureLessons();
    const tx = await getTursoClient().transaction("write");
    try {
      const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const existing = await tx.execute({ sql: "SELECT id, status, attempts FROM lessons WHERE input_hash = ?", args: [hash] });
      if (existing.rows[0] && existing.rows[0].status !== "failed") {
        await tx.commit(); return NextResponse.json({ id: existing.rows[0].id });
      }
      if (existing.rows[0] && Number(existing.rows[0].attempts) >= 3) {
        await tx.rollback(); return NextResponse.json({ error: "This lesson needs a worker check before another attempt." }, { status: 429 });
      }
      const worker = await tx.execute("SELECT id FROM lesson_workers WHERE available = 1 AND heartbeat_at > unixepoch() - 90 LIMIT 1");
      if (!worker.rows.length) {
        await tx.rollback(); return NextResponse.json({ error: "Start the lesson worker on your Mac and sign in to Codex, then try again." }, { status: 503 });
      }
      const pending = await tx.execute("SELECT count(*) AS total FROM lessons WHERE status IN ('queued','running')");
      const recent = await tx.execute("SELECT count(*) AS total FROM lessons WHERE created_at > unixepoch() - 86400");
      if (Number(pending.rows[0].total) >= 3 || Number(recent.rows[0].total) >= 12) {
        await tx.rollback(); return NextResponse.json({ error: "The lesson queue is full. Try again later." }, { status: 429 });
      }
      const id = (existing.rows[0]?.id as string) || randomUUID();
      if (existing.rows.length) {
        await tx.execute({ sql: "UPDATE lessons SET status='queued', stage='Waiting for Mac', error=NULL, updated_at=unixepoch() WHERE id=?", args: [id] });
      } else {
        await tx.execute({ sql: "INSERT INTO lessons(id,input_hash,source_url,transcript,description) VALUES(?,?,?,?,?)", args: [id, hash, input.url, input.transcript, input.description] });
      }
      await tx.commit(); return NextResponse.json({ id }, { status: 202 });
    } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
  } catch { return NextResponse.json({ error: "Could not queue this lesson. Try again shortly." }, { status: 503 }); }
}
