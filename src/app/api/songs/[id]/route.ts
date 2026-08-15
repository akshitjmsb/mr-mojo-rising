import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { execute, queryAll, queryOne } from "@/lib/queries";
import type {
  Chord,
  Lyrics,
  PracticeProfile,
  Section,
  Song,
  Stem,
  StemLayer,
  TabNote,
} from "@/lib/database.types";
import { getPracticeTuning, PRACTICE_TUNINGS } from "@/lib/guitar";

function defaultPracticeProfile(songId: string): PracticeProfile {
  const tuning = getPracticeTuning("standard");
  return {
    song_id: songId,
    tuning_id: tuning.id,
    tuning_name: tuning.name,
    tuning_offset: tuning.offset,
    chord_shape_shift: tuning.chordShapeShift,
    tab_confidence_threshold: 0.6,
    source: "default",
    updated_at: 0,
  };
}

function legacyStemLayers(stems: Stem | null): StemLayer[] {
  if (!stems) return [];
  const definitions: Array<{
    key: string;
    label: string;
    instrument: StemLayer["instrument"];
    url: string | null;
    learnable: 0 | 1;
  }> = [
    { key: "guitars", label: "All Guitars", instrument: "guitar", url: stems.guitar_url, learnable: 1 },
    { key: "bass", label: "Bass", instrument: "bass", url: stems.bass_url, learnable: 1 },
    { key: "vocals", label: "Vocals", instrument: "vocals", url: stems.vocals_url, learnable: 0 },
    { key: "drums", label: "Drums", instrument: "drums", url: stems.drums_url, learnable: 0 },
    { key: "full", label: "Full Song", instrument: "full", url: stems.original_url, learnable: 0 },
  ];
  return definitions.flatMap((definition, sortOrder) =>
    definition.url
      ? [{
          id: `legacy-${definition.key}`,
          song_id: stems.song_id,
          layer_key: definition.key,
          label: definition.label,
          instrument: definition.instrument,
          role: "all",
          url: definition.url,
          source_model: null,
          quality_status: "ready" as const,
          is_learnable: definition.learnable,
          sort_order: sortOrder,
          updated_at: 0,
        }]
      : [],
  );
}

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

  let stemLayers: StemLayer[] = [];
  try {
    stemLayers = await queryAll<StemLayer>(
      `SELECT * FROM stem_layers WHERE song_id = ? ORDER BY sort_order ASC`,
      [id],
    );
  } catch {
    // Legacy databases continue to work until the additive migration runs.
  }
  if (stemLayers.length === 0) stemLayers = legacyStemLayers(stems ?? null);

  const sections = await queryAll<Section>(
    `SELECT * FROM sections WHERE song_id = ? ORDER BY start_time ASC`,
    [id],
  );

  // Return the complete audio-derived sequence. Verification remains attached
  // as provenance so the UI can distinguish strong anchors from best guesses
  // without turning an uncertain recording into an empty lesson.
  let chords: Chord[] = [];
  try {
    chords = await queryAll<Chord>(
      `SELECT c.*,
              v.state AS verification_state,
              v.reason AS verification_reason,
              v.method AS verification_method,
              v.evidence_version,
              v.acoustic_score,
              v.score_margin,
              v.frame_stability,
              v.bass_support
       FROM chords c
       INNER JOIN chord_verifications v ON v.chord_id = c.id
       WHERE c.song_id = ?
       ORDER BY c.start_time ASC`,
      [id],
    );
  } catch {
    // Until the additive migration and audio analysis run, no sequence exists.
  }

  const lyrics = await queryOne<Lyrics>(
    `SELECT * FROM lyrics WHERE song_id = ?`,
    [id],
  );

  const practiceProfile = await queryOne<PracticeProfile>(
    `SELECT * FROM song_practice_profiles WHERE song_id = ?`,
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
    stem_layers: stemLayers,
    sections,
    chords,
    lyrics: lyrics ?? null,
    tab_notes: tabNotes,
    practice_profile: practiceProfile ?? defaultPracticeProfile(id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const song = await queryOne<Song>(`SELECT id FROM songs WHERE id = ?`, [id]);
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  let tuningId: string | undefined;
  try {
    const body = (await request.json()) as { tuning_id?: string };
    tuningId = body.tuning_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tuning = PRACTICE_TUNINGS.find((option) => option.id === tuningId);
  if (!tuning) {
    return NextResponse.json(
      { error: "Unsupported guitar tuning" },
      { status: 400 },
    );
  }

  await execute(
    `INSERT INTO song_practice_profiles
      (song_id, tuning_id, tuning_name, tuning_offset, chord_shape_shift,
       tab_confidence_threshold, source, updated_at)
     VALUES (?, ?, ?, ?, ?, 0.6, 'manual', unixepoch())
     ON CONFLICT(song_id) DO UPDATE SET
       tuning_id = excluded.tuning_id,
       tuning_name = excluded.tuning_name,
       tuning_offset = excluded.tuning_offset,
       chord_shape_shift = excluded.chord_shape_shift,
       source = 'manual',
       updated_at = unixepoch()`,
    [id, tuning.id, tuning.name, tuning.offset, tuning.chordShapeShift],
  );

  const profile = await queryOne<PracticeProfile>(
    `SELECT * FROM song_practice_profiles WHERE song_id = ?`,
    [id],
  );
  return NextResponse.json(profile);
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
  let stemLayers: StemLayer[] = [];
  try {
    stemLayers = await queryAll<StemLayer>(
      `SELECT * FROM stem_layers WHERE song_id = ?`,
      [id],
    );
  } catch {
    // The legacy stems row still covers blob cleanup before migration.
  }

  // Delete the database row first. Its cascading job deletion causes the Mac
  // worker to release the lease and terminate any expensive subprocess.
  try {
    await execute(`DELETE FROM songs WHERE id = ?`, [id]);
  } catch (err) {
    console.error("Failed to delete song", err);
    return NextResponse.json(
      { error: "Failed to delete song" },
      { status: 500 },
    );
  }

  if (stems && process.env.BLOB_READ_WRITE_TOKEN) {
    const urls = [
      stems.original_url,
      stems.guitar_url,
      stems.vocals_url,
      stems.drums_url,
      stems.bass_url,
      ...stemLayers.map((layer) => layer.url),
    ].filter((u): u is string => typeof u === "string" && u.length > 0);

    if (urls.length > 0) {
      try {
        await del(urls, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (err) {
        console.error("Failed to delete blob files", err);
      }
    }
  }

  return NextResponse.json({ success: true, id });
}
