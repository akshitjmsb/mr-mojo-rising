import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { execute, queryAll, queryOne } from "@/lib/queries";
import type {
  Chord,
  Lyrics,
  Section,
  Song,
  Stem,
  TabNote,
} from "@/lib/database.types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const song = await queryOne<Song>(`SELECT * FROM songs WHERE id = ?`, [id]);
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const stems = await queryOne<Stem>(`SELECT * FROM stems WHERE song_id = ?`, [
    id,
  ]);

  const sections = await queryAll<Section>(
    `SELECT * FROM sections WHERE song_id = ? ORDER BY start_time ASC`,
    [id],
  );

  const chords = await queryAll<Chord>(
    `SELECT * FROM chords WHERE song_id = ? ORDER BY start_time ASC`,
    [id],
  );

  const lyrics = await queryOne<Lyrics>(
    `SELECT * FROM lyrics WHERE song_id = ?`,
    [id],
  );

  // Tolerate a DB that predates the tab_notes migration.
  let tabNotes: TabNote[] = [];
  try {
    tabNotes = await queryAll<TabNote>(
      `SELECT * FROM tab_notes WHERE song_id = ? ORDER BY start_time ASC`,
      [id],
    );
  } catch {
    tabNotes = [];
  }

  return NextResponse.json({
    song,
    stems: stems ?? null,
    sections,
    chords,
    lyrics: lyrics ?? null,
    tab_notes: tabNotes,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const song = await queryOne<Song>(`SELECT id FROM songs WHERE id = ?`, [id]);
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const stems = await queryOne<Stem>(`SELECT * FROM stems WHERE song_id = ?`, [
    id,
  ]);

  if (stems && process.env.BLOB_READ_WRITE_TOKEN) {
    const urls = [
      stems.original_url,
      stems.guitar_url,
      stems.vocals_url,
      stems.drums_url,
      stems.bass_url,
    ].filter((u): u is string => typeof u === "string" && u.length > 0);

    if (urls.length > 0) {
      try {
        await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (err) {
        console.error("Failed to delete blob files", err);
      }
    }
  }

  try {
    await execute(`DELETE FROM songs WHERE id = ?`, [id]);
  } catch (err) {
    console.error("Failed to delete song", err);
    return NextResponse.json(
      { error: "Failed to delete song" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id });
}
