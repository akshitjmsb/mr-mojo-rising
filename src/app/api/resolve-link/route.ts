import { NextResponse } from "next/server";
import type { ResolvedLink } from "@/lib/intake";

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

function extractFirstUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  const candidate = (match?.[0] ?? value).trim().replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function extractYouTubeId(input: URL): string | null {
  if (input.hostname === "youtu.be") {
    const id = input.pathname.replace(/^\/+/, "").split("/")[0];
    return id || null;
  }
  if (input.pathname.startsWith("/watch")) {
    return input.searchParams.get("v");
  }
  if (input.pathname.startsWith("/shorts/")) {
    const id = input.pathname.split("/")[2];
    return id || null;
  }
  if (input.pathname.startsWith("/embed/")) {
    const id = input.pathname.split("/")[2];
    return id || null;
  }
  if (input.pathname.startsWith("/live/")) {
    const id = input.pathname.split("/")[2];
    return id || null;
  }
  return null;
}

type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

async function resolveYouTube(videoId: string): Promise<ResolvedLink> {
  const youtube_url = `https://www.youtube.com/watch?v=${videoId}`;

  // oEmbed gives us title/channel without needing the API key.
  let title = "YouTube video";
  let channel = "";
  let thumbnail: string | null = null;
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtube_url)}`,
    );
    if (oembedRes.ok) {
      const data = (await oembedRes.json()) as YouTubeOEmbed;
      title = data.title ?? title;
      channel = data.author_name ?? channel;
      thumbnail = data.thumbnail_url ?? null;
    }
  } catch {
    // Best-effort enrichment; fall through with defaults.
  }

  return {
    source: "youtube",
    youtube_url,
    videoId,
    title,
    channel,
    thumbnail,
    durationLabel: null,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const raw = body.url?.trim();
    if (!raw) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(extractFirstUrl(raw));
    } catch {
      return NextResponse.json(
        { error: "That doesn't look like a valid URL." },
        { status: 400 },
      );
    }

    const host = parsed.hostname.toLowerCase();

    if (YT_HOSTS.has(host)) {
      const id = extractYouTubeId(parsed);
      if (!id) {
        return NextResponse.json(
          { error: "Couldn't find a video ID in that YouTube link." },
          { status: 400 },
        );
      }
      const resolved = await resolveYouTube(id);
      return NextResponse.json(resolved satisfies ResolvedLink);
    }

    return NextResponse.json(
      {
        error: "Unsupported link. Paste a YouTube video URL.",
      },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
