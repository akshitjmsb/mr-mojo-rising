import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";
import { ensureLessons } from "@/lib/lesson-store";

export const dynamic = "force-dynamic";
// This endpoint only exposes queue operations; never accepts SQL from a client.
export async function POST(request: Request) {
  const expected = process.env.LESSON_WORKER_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const expectedBytes = Buffer.from(expected || ""), suppliedBytes = Buffer.from(supplied);
  if (!expected || suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "Worker authentication required." }, { status: 401 });
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Missing request." }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2000000) { await reader.cancel(); return NextResponse.json({ error: "Pack too large." }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body.owner !== "string" || !/^[\w-]{1,80}$/.test(body.owner)) return NextResponse.json({ error: "Invalid worker." }, { status: 400 });
    await ensureLessons(); const db = getTursoClient();
    if (body.action === "heartbeat") {
      await db.execute({ sql: "INSERT INTO lesson_workers(id,available,message,heartbeat_at) VALUES(?,?,?,unixepoch()) ON CONFLICT(id) DO UPDATE SET available=excluded.available,message=excluded.message,heartbeat_at=unixepoch()", args: [body.owner, body.available === true ? 1 : 0, body.available === true ? "Codex subscription connected" : "Sign in to Codex with ChatGPT."] });
      if (typeof body.id === "string") await db.execute({ sql: "UPDATE lessons SET heartbeat_at=unixepoch() WHERE id=? AND locked_by=? AND status='running'", args: [body.id, body.owner] });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "claim") {
      await db.execute("UPDATE lessons SET status=CASE WHEN attempts >= 2 THEN 'failed' ELSE 'queued' END, stage='Worker interrupted', error='The worker stopped before this lesson finished.', locked_by=NULL, updated_at=unixepoch() WHERE status='running' AND heartbeat_at < unixepoch()-120");
      const result = await db.execute({ sql: "UPDATE lessons SET status='running', locked_by=?, attempts=attempts+1, heartbeat_at=unixepoch(), updated_at=unixepoch(), error=NULL WHERE id=(SELECT id FROM lessons WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' RETURNING id,source_url,transcript,description", args: [body.owner] });
      return NextResponse.json({ job: result.rows[0] ?? null });
    }
    if (typeof body.id !== "string") return NextResponse.json({ error: "Missing lesson." }, { status: 400 });
    let result;
    if (body.action === "progress" && typeof body.stage === "string") {
      result = await db.execute({ sql: "UPDATE lessons SET stage=?, updated_at=unixepoch() WHERE id=? AND locked_by=? AND status='running' RETURNING id", args: [body.stage.slice(0, 200), body.id, body.owner] });
    } else if (body.action === "complete" && body.pack?.version === 1 && Array.isArray(body.pack.sections) && typeof body.title === "string") {
      result = await db.execute({ sql: "UPDATE lessons SET status='ready', stage='Ready to practice', pack_json=?, title=?, updated_at=unixepoch(), locked_by=NULL WHERE id=? AND locked_by=? AND status='running' RETURNING id", args: [JSON.stringify(body.pack), body.title.slice(0, 300), body.id, body.owner] });
    } else if (body.action === "fail" && typeof body.error === "string") {
      result = await db.execute({ sql: "UPDATE lessons SET status='failed',stage='Needs attention',error=?,updated_at=unixepoch(),locked_by=NULL WHERE id=? AND locked_by=? AND status='running' RETURNING id", args: [body.error.slice(0, 300), body.id, body.owner] });
    } else return NextResponse.json({ error: "Unknown worker operation." }, { status: 400 });
    return NextResponse.json({ ok: result.rows.length > 0 }, { status: result.rows.length ? 200 : 409 });
  } catch { return NextResponse.json({ error: "Worker request could not complete." }, { status: 503 }); }
}
