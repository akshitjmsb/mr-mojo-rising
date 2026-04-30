import { NextResponse } from "next/server";
import type { ResolvedLink } from "@/lib/intake";

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);

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
  return null;
}

type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

type SpotifyOEmbed = {
  title?: string;
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

async function resolveSpotify(spotifyUrl: string): Promise<ResolvedLink> {
  // 1) Get title + artist from Spotify oEmbed (no auth required).
  const oembedRes = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`,
  );
  if (!oembedRes.ok) {
    throw new Error(
      `Spotify did not return metadata (HTTP ${oembedRes.status}).`,
    );
  }
  const oembed = (await oembedRes.json()) as SpotifyOEmbed;
  const spotifyTitle = (oembed.title ?? "").trim();
  if (!spotifyTitle) {
    throw new Error("Could not read track title from Spotify.");
  }

  // 2) Search YouTube for the matching video using our own search route.
  // Internal fetch to keep the API key server-side. We construct the absolute
  // URL using the request's origin.
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "YouTube search is not configured. Set YOUTUBE_API_KEY to resolve Spotify links.",
    );
  }

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", spotifyTitle);
  searchUrl.searchParams.set("maxResults", "1");
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    throw new Error(`YouTube search failed (HTTP ${searchRes.status}).`);
  }
  type YouTubeSearchResponse = {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: {
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
    }>;
  };
  const data = (await searchRes.json()) as YouTubeSearchResponse;
  const top = data.items?.[0];
  const videoId = top?.id?.videoId;
  if (!videoId) {
    throw new Error("No matching YouTube video found for this Spotify track.");
  }

  return {
    source: "spotify",
    youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    title: top?.snippet?.title ?? spotifyTitle,
    channel: top?.snippet?.channelTitle ?? "",
    thumbnail:
      top?.snippet?.thumbnails?.medium?.url ??
      top?.snippet?.thumbnails?.default?.url ??
      null,
    durationLabel: null,
    spotifyTitle,
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
      parsed = new URL(raw);
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

    if (SPOTIFY_HOSTS.has(host)) {
      if (!parsed.pathname.includes("/track/")) {
        return NextResponse.json(
          {
            error:
              "Only Spotify track links are supported (open.spotify.com/track/...).",
          },
          { status: 400 },
        );
      }
      try {
        const resolved = await resolveSpotify(parsed.toString());
        return NextResponse.json(resolved satisfies ResolvedLink);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to resolve Spotify link.";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    return NextResponse.json(
      {
        error:
          "Unsupported link. Paste a YouTube or Spotify track URL.",
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

