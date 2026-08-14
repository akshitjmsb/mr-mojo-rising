import type { YouTubeSearchResult } from "./intake";

type UnknownRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIsoDuration(iso: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  return (
    (hours ? Number(hours) * 3600 : 0) +
    (minutes ? Number(minutes) * 60 : 0) +
    (seconds ? Number(seconds) : 0)
  );
}

function parseDurationLabel(label: string | null): number | null {
  if (!label) return null;
  const parts = label
    .split(":")
    .map((part) => Number(part.replace(/\D/g, "")));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(remainder).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function textFromRuns(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.simpleText === "string") return value.simpleText;
  if (!Array.isArray(value.runs)) return "";
  return value.runs
    .map((run) => (isRecord(run) && typeof run.text === "string" ? run.text : ""))
    .join("");
}

function extractJsonObject(html: string, marker: string): unknown | null {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function collectVideoRenderers(value: unknown, output: UnknownRecord[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectVideoRenderers(item, output);
    return;
  }
  if (!isRecord(value)) return;
  if (isRecord(value.videoRenderer)) output.push(value.videoRenderer);
  for (const nested of Object.values(value)) collectVideoRenderers(nested, output);
}

export function parseYouTubeSearchHtml(
  html: string,
  limit = 10,
): YouTubeSearchResult[] {
  const markers = [
    "var ytInitialData =",
    'window["ytInitialData"] =',
    "ytInitialData =",
  ];
  const initialData = markers
    .map((marker) => extractJsonObject(html, marker))
    .find((value) => value !== null);
  if (!initialData) return [];

  const renderers: UnknownRecord[] = [];
  collectVideoRenderers(initialData, renderers);
  const seen = new Set<string>();
  const results: YouTubeSearchResult[] = [];

  for (const renderer of renderers) {
    const videoId = typeof renderer.videoId === "string" ? renderer.videoId : "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
    const title = textFromRuns(renderer.title) || "Untitled";
    const channel =
      textFromRuns(renderer.ownerText) ||
      textFromRuns(renderer.longBylineText) ||
      "Unknown";
    const durationLabel = textFromRuns(renderer.lengthText) || null;
    const thumbnailContainer = isRecord(renderer.thumbnail)
      ? renderer.thumbnail.thumbnails
      : null;
    const thumbnails = Array.isArray(thumbnailContainer)
      ? thumbnailContainer.filter(isRecord)
      : [];
    const thumbnail =
      [...thumbnails]
        .reverse()
        .find((item) => typeof item.url === "string")?.url as string | undefined;

    seen.add(videoId);
    results.push({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      channel,
      thumbnail: thumbnail ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      durationSeconds: parseDurationLabel(durationLabel),
      durationLabel,
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function searchWithPublicPage(query: string, limit: number) {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new Error(`YouTube search returned HTTP ${response.status}.`);
  }
  const results = parseYouTubeSearchHtml(await response.text(), limit);
  if (results.length === 0) {
    throw new Error("YouTube did not return any playable videos.");
  }
  return results;
}

async function searchWithDataApi(query: string, limit: number, apiKey: string) {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", String(limit));
  searchUrl.searchParams.set("videoCategoryId", "10");
  searchUrl.searchParams.set("key", apiKey);

  const searchResponse = await fetch(searchUrl, { cache: "no-store" });
  if (!searchResponse.ok) {
    throw new Error(`YouTube API returned HTTP ${searchResponse.status}.`);
  }
  const searchData = (await searchResponse.json()) as {
    items?: YouTubeSearchItem[];
  };
  const items = searchData.items ?? [];
  const videoIds = items
    .map((item) => item.id?.videoId)
    .filter((videoId): videoId is string => Boolean(videoId));
  let durations = new Map<string, number | null>();

  if (videoIds.length > 0) {
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails");
    detailsUrl.searchParams.set("id", videoIds.join(","));
    detailsUrl.searchParams.set("key", apiKey);
    const detailsResponse = await fetch(detailsUrl, { cache: "no-store" });
    if (detailsResponse.ok) {
      const detailsData = (await detailsResponse.json()) as {
        items?: YouTubeVideoItem[];
      };
      durations = new Map(
        (detailsData.items ?? []).map((item) => [
          item.id ?? "",
          parseIsoDuration(item.contentDetails?.duration ?? ""),
        ]),
      );
    }
  }

  return items.flatMap((item): YouTubeSearchResult[] => {
    const videoId = item.id?.videoId;
    if (!videoId) return [];
    const durationSeconds = durations.get(videoId) ?? null;
    return [
      {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: item.snippet?.title ?? "Untitled",
        channel: item.snippet?.channelTitle ?? "Unknown",
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        durationSeconds,
        durationLabel: formatDuration(durationSeconds),
      },
    ];
  });
}

export async function searchYouTube(
  query: string,
  limit = 10,
): Promise<YouTubeSearchResult[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 25);
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const results = await searchWithDataApi(query, boundedLimit, apiKey);
      if (results.length > 0) return results;
    } catch (error) {
      console.warn("[youtube-search] Data API unavailable; using public fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return searchWithPublicPage(query, boundedLimit);
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  const ignored = new Set(["a", "an", "and", "by", "feat", "ft", "official", "the"]);
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !ignored.has(token));
}

export function pickBestYouTubeMatch(
  results: YouTubeSearchResult[],
  trackTitle: string,
  artists: string[],
): YouTubeSearchResult | null {
  const trackTokens = meaningfulTokens(trackTitle);
  const artistTokens = meaningfulTokens(artists.join(" "));
  const undesirable = ["cover", "tutorial", "karaoke", "reaction", "lesson"];

  const scored = results.map((result, index) => {
    const title = normalize(result.title);
    const channel = normalize(result.channel);
    const trackMatches = trackTokens.filter((token) => title.includes(token)).length;
    const artistMatches = artistTokens.filter(
      (token) => title.includes(token) || channel.includes(token),
    ).length;
    let score =
      (trackTokens.length ? (trackMatches / trackTokens.length) * 60 : 0) +
      (artistTokens.length ? (artistMatches / artistTokens.length) * 35 : 0) -
      index * 0.2;
    if (/official|audio|video|topic/.test(`${title} ${channel}`)) score += 8;
    if (undesirable.some((term) => title.includes(term))) score -= 45;
    if (title.includes(" live ") || title.endsWith(" live")) score -= 15;
    if (
      result.durationSeconds !== null &&
      (result.durationSeconds < 60 || result.durationSeconds > 1200)
    ) {
      score -= 20;
    }
    return { result, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.result ?? null;
}
