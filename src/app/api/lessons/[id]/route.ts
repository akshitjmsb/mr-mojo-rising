import { NextResponse } from "next/server";
import { ensureLessons } from "@/lib/lesson-store";
import { getTursoClient } from "@/lib/turso";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await ensureLessons();
    const result = await getTursoClient().execute({ sql: "SELECT id, source_url, title, status, stage, error, pack_json, created_at, updated_at, heartbeat_at FROM lessons WHERE id=?", args: [id] });
    if (!result.rows[0]) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    const { pack_json, ...row } = result.rows[0];
    return NextResponse.json({ ...row, pack: pack_json ? JSON.parse(String(pack_json)) : null });
  } catch { return NextResponse.json({ error: "Could not load this lesson." }, { status: 503 }); }
}
