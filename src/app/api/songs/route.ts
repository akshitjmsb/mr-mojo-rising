import { NextResponse } from "next/server";
import { queryAll } from "@/lib/queries";
import type { Song } from "@/lib/database.types";

export async function GET() {
  try {
    const songs = await queryAll<Song>(
      `SELECT * FROM songs ORDER BY created_at DESC`,
    );
    return NextResponse.json(songs);
  } catch (err) {
    console.error("Failed to fetch songs", err);
    return NextResponse.json({ error: "Failed to fetch songs" }, { status: 500 });
  }
}
