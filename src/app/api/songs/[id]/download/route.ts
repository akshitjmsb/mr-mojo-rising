import { NextResponse } from "next/server";
import { queryOne } from "@/lib/queries";
import type { Song, Stem, StemLayer } from "@/lib/database.types";

type StemKey = "full" | "guitar" | "vocals" | "drums" | "bass";

const STEM_COLUMN: Record<StemKey, keyof Stem> = {
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

const LEGACY_LAYER_STEM: Record<string, StemKey> = {
  full: "full",
  guitars: "guitar",
  guitar: "guitar",
  vocals: "vocals",
  drums: "drums",
  bass: "bass",
};

function sanitizeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "song"
  );
}

function parseStemKey(raw: string | null): StemKey | null {
  if (!raw) return null;
  return raw in STEM_COLUMN ? (raw as StemKey) : null;
}

function extensionFor(contentType: string | null, sourceUrl: string) {
  if (contentType?.includes("wav")) return "wav";
  if (contentType?.includes("mp4") || contentType?.includes("m4a")) return "m4a";
  if (contentType?.includes("ogg")) return "ogg";
  if (contentType?.includes("mpeg")) return "mp3";
  const pathname = new URL(sourceUrl).pathname;
  const extension = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return extension?.toLowerCase() || "audio";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const stem = parseStemKey(url.searchParams.get("stem"));
  const layerKey = url.searchParams.get("layer")?.trim() || null;

  if (!stem && !layerKey) {
    return NextResponse.json({ error: "Invalid audio piece" }, { status: 400 });
  }

  const song = await queryOne<Pick<Song, "id" | "title">>(
    `SELECT id, title FROM songs WHERE id = ?`,
    [id],
  );
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  let sourceUrl: string | null | undefined;
  let sourceLabel: string;
  if (layerKey) {
    const layer = await queryOne<Pick<StemLayer, "url" | "label">>(
      `SELECT url, label FROM stem_layers
       WHERE song_id = ? AND layer_key = ?
       LIMIT 1`,
      [id, layerKey],
    );
    sourceUrl = layer?.url;
    sourceLabel = layer?.label || layerKey;
    const legacyStem = LEGACY_LAYER_STEM[layerKey];
    if (!sourceUrl && legacyStem) {
      const stems = await queryOne<Stem>(
        `SELECT original_url, guitar_url, vocals_url, drums_url, bass_url
         FROM stems WHERE song_id = ?`,
        [id],
      );
      sourceUrl = stems?.[STEM_COLUMN[legacyStem]] as
        | string
        | null
        | undefined;
      sourceLabel = STEM_LABEL[legacyStem];
    }
  } else {
    const stems = await queryOne<Stem>(
      `SELECT original_url, guitar_url, vocals_url, drums_url, bass_url
       FROM stems WHERE song_id = ?`,
      [id],
    );
    sourceUrl = stems?.[STEM_COLUMN[stem!]] as string | null | undefined;
    sourceLabel = STEM_LABEL[stem!];
  }

  if (!sourceUrl) {
    return NextResponse.json(
      { error: "Requested stem is not available" },
      { status: 404 },
    );
  }

  const upstream = await fetch(sourceUrl);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Failed to fetch stem file" },
      { status: 502 },
    );
  }

  const songSlug = sanitizeFileName(song.title || "song");
  const contentType = upstream.headers.get("content-type") || "audio/mpeg";
  const sourceSlug = sanitizeFileName(sourceLabel);
  const fileName = `${songSlug}-${sourceSlug}.${extensionFor(contentType, sourceUrl)}`;
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
  headers.set("Cache-Control", "no-store");

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new NextResponse(upstream.body, { status: 200, headers });
}
