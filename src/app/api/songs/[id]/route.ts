import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();

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
