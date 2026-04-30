import { NextResponse } from "next/server";
import type { YouTubeSearchResult } from "@/lib/intake";

function parseIsoDuration(iso: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;
  return (
    (h ? parseInt(h, 10) * 3600 : 0) +
    (m ? parseInt(m, 10) * 60 : 0) +
    (s ? parseInt(s, 10) : 0)
  );
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

type YouTubeVideoItem = {
  id?: string;
  contentDetails?: { duration?: string };
};

export async function GET(request: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube search is not configured. Set YOUTUBE_API_KEY." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const maxResults = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 1),
    25,
  );

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("videoCategoryId", "10");
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      const body = await searchRes.text().catch(() => "");
      return NextResponse.json(
        { error: "YouTube search failed", detail: body.slice(0, 200) },
        { status: searchRes.status },
      );
    }
    const searchData = (await searchRes.json()) as { items?: YouTubeSearchItem[] };
    const items = searchData.items ?? [];

    const videoIds = items
      .map((it) => it.id?.videoId)
      .filter((v): v is string => typeof v === "string");

    let durations = new Map<string, number | null>();
    if (videoIds.length > 0) {
      const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      detailsUrl.searchParams.set("part", "contentDetails");
      detailsUrl.searchParams.set("id", videoIds.join(","));
      detailsUrl.searchParams.set("key", apiKey);

      const detailsRes = await fetch(detailsUrl.toString());
      if (detailsRes.ok) {
        const detailsData = (await detailsRes.json()) as {
          items?: YouTubeVideoItem[];
        };
        durations = new Map(
          (detailsData.items ?? []).map((it) => [
            it.id ?? "",
            parseIsoDuration(it.contentDetails?.duration ?? ""),
          ]),
        );
      }
    }

    const results: YouTubeSearchResult[] = items
      .map((it) => {
        const videoId = it.id?.videoId;
        if (!videoId) return null;
        const seconds = durations.get(videoId) ?? null;
        return {
          videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: it.snippet?.title ?? "Untitled",
          channel: it.snippet?.channelTitle ?? "Unknown",
          thumbnail:
            it.snippet?.thumbnails?.medium?.url ??
            it.snippet?.thumbnails?.default?.url ??
            "",
          durationSeconds: seconds,
          durationLabel: formatDuration(seconds),
        };
      })
      .filter((r): r is YouTubeSearchResult => r !== null);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach YouTube" },
      { status: 502 },
    );
  }
}
