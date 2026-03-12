import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = createAdminClient();

  // Fetch song
  const { data: song, error: songError } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .single();

  if (songError || !song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  // Fetch stems
  const { data: stems } = await supabase
    .from("stems")
    .select("*")
    .eq("song_id", id)
    .single();

  // Fetch sections
  const { data: sections } = await supabase
    .from("sections")
    .select("*")
    .eq("song_id", id)
    .order("start_time", { ascending: true });

  // Fetch chords
  const { data: chords } = await supabase
    .from("chords")
    .select("*")
    .eq("song_id", id)
    .order("start_time", { ascending: true });

  // Fetch lyrics
  const { data: lyrics } = await supabase
    .from("lyrics")
    .select("*")
    .eq("song_id", id)
    .single();

  return NextResponse.json({
    song,
    stems: stems || null,
    sections: sections || [],
    chords: chords || [],
    lyrics: lyrics || null,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: song, error: songError } = await supabase
    .from("songs")
    .select("id")
    .eq("id", id)
    .single();

  if (songError || !song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  // Best-effort storage cleanup for common stem paths.
  const knownPaths = [
    `${id}/original.wav`,
    `${id}/other.wav`,
    `${id}/vocals.wav`,
    `${id}/drums.wav`,
    `${id}/bass.wav`,
  ];

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      await admin.storage.from("stems").remove(knownPaths);
    } catch (error) {
      console.error("Failed to delete stem files", error);
    }
  }

  const { error: deleteError } = await supabase
    .from("songs")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete song" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, id });
}
