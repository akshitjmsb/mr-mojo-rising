const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

export function canonicalizeYouTubeUrl(raw: string): string | null {
  try {
    const value = raw.trim();
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (YOUTUBE_HOSTS.has(host)) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") ?? "";
      } else if (/^\/(shorts|embed|live)\//.test(url.pathname)) {
        videoId = url.pathname.split("/").filter(Boolean)[1] ?? "";
      }
    }

    if (!videoId || !/^[A-Za-z0-9_-]+$/.test(videoId)) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
}
