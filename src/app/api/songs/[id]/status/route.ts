import { NextResponse } from "next/server";
import { queryOne } from "@/lib/queries";

type Status = {
  id: string;
  status: string;
  processing_stage: string | null;
  last_error: string | null;
  updated_at: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const song = await queryOne<Status>(
    `SELECT id, status, processing_stage, last_error, updated_at
     FROM songs WHERE id = ?`,
    [id],
  );

  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  return NextResponse.json(song);
}
