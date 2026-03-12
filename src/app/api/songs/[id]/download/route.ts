import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type StemKey = "full" | "guitar" | "vocals" | "drums" | "bass";

const STEM_COLUMN: Record<StemKey, "original_url" | "guitar_url" | "vocals_url" | "drums_url" | "bass_url"> = {
  full: "original_url",
  guitar: "guitar_url",
  vocals: "vocals_url",
  drums: "drums_url",
  bass: "bass_url",
};

const STEM_LABEL: Record<StemKey, string> = {
  full: "full-mix",
  guitar: "guitar",
  vocals: "vocals",
  drums: "drums",
  bass: "bass",
};

function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "song";
}

function parseStemKey(raw: string | null): StemKey | null {
  if (!raw) return null;
  return raw in STEM_COLUMN ? (raw as StemKey) : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const stem = parseStemKey(url.searchParams.get("stem"));

  if (!stem) {
    return NextResponse.json({ error: "Invalid stem type" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: song } = await supabase
    .from("songs")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  const { data: stems } = await supabase
    .from("stems")
    .select("original_url, guitar_url, vocals_url, drums_url, bass_url")
    .eq("song_id", id)
    .single();

  if (!stems) {
    return NextResponse.json({ error: "No stems available yet" }, { status: 404 });
  }

  const sourceUrl = stems[STEM_COLUMN[stem]];
  if (!sourceUrl) {
    return NextResponse.json({ error: "Requested stem is not available" }, { status: 404 });
  }

  const upstream = await fetch(sourceUrl);
  if (!upstream.ok) {
    return NextResponse.json({ error: "Failed to fetch stem file" }, { status: 502 });
  }

  const songSlug = sanitizeFileName(song.title || "song");
  const fileName = `${songSlug}-${STEM_LABEL[stem]}.wav`;
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "audio/wav");
  headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
  headers.set("Cache-Control", "no-store");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new NextResponse(upstream.body, { status: 200, headers });
}
