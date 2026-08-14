import { NextResponse } from "next/server";
import type { ResolvedLink } from "@/lib/intake";
import {
  pickBestYouTubeMatch,
  searchYouTube,
} from "@/lib/youtube-search";

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const SPOTIFY_HOSTS = new Set([
  "open.spotify.com",
  "play.spotify.com",
  "spotify.link",
  "spotify.app.link",
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

type SpotifyOEmbed = {
  title?: string;
  thumbnail_url?: string;
  iframe_url?: string;
};

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function extractSpotifyArtists(html: string) {
  const artistsBlock = /"artists":\[([\s\S]*?)\]/.exec(html)?.[1] ?? "";
  return Array.from(artistsBlock.matchAll(/"name":"((?:\\.|[^"\\])*)"/g))
    .map((match) => decodeJsonString(match[1]).trim())
    .filter(Boolean);
}

async function normalizeSpotifyTrackUrl(input: URL) {
  if (input.hostname === "open.spotify.com" || input.hostname === "play.spotify.com") {
    return input.toString();
  }
  const response = await fetch(input, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const redirected = new URL(response.url);
  if (redirected.hostname !== "open.spotify.com") {
    throw new Error("That Spotify share link did not resolve to a track.");
  }
  return redirected.toString();
}

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

  // Spotify oEmbed omits the artist. Its public embed payload contains it,
  // which gives us a much safer YouTube match without Spotify credentials.
  let artists: string[] = [];
  try {
    const embedUrl = oembed.iframe_url || spotifyUrl.replace("/track/", "/embed/track/");
    const embedResponse = await fetch(embedUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (embedResponse.ok) artists = extractSpotifyArtists(await embedResponse.text());
  } catch {
    // Title-only matching still works; the confirmation card remains the gate.
  }

  const query = [spotifyTitle, ...artists, "official audio"].join(" ");
  const results = await searchYouTube(query, 10);
  const match = pickBestYouTubeMatch(results, spotifyTitle, artists);
  if (!match) {
    throw new Error("No matching YouTube video found for this Spotify track.");
  }

  return {
    source: "spotify",
    youtube_url: match.url,
    videoId: match.videoId,
    title: match.title,
    channel: match.channel,
    thumbnail: match.thumbnail || oembed.thumbnail_url || null,
    durationLabel: match.durationLabel,
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

    if (SPOTIFY_HOSTS.has(host)) {
      try {
        const spotifyUrl = await normalizeSpotifyTrackUrl(parsed);
        if (!new URL(spotifyUrl).pathname.includes("/track/")) {
          return NextResponse.json(
            {
              error:
                "Only Spotify track links are supported. Open the song in Spotify and choose Share → Copy link.",
            },
            { status: 400 },
          );
        }
        const resolved = await resolveSpotify(spotifyUrl);
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
