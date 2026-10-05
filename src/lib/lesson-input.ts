export function youtubeLessonUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const id = host === "youtu.be" ? url.pathname.slice(1) : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host) && url.pathname === "/watch" ? url.searchParams.get("v") : null;
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}

export function parseLessonInput(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("Add a YouTube lesson or transcript.");
  const value = body as Record<string, unknown>;
  for (const key of ["url", "transcript", "description"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") throw new Error("Invalid lesson input.");
  }
  const rawUrl = (value.url as string | undefined)?.trim() || "";
  const url = rawUrl ? youtubeLessonUrl(rawUrl) : null;
  const transcript = (value.transcript as string | undefined)?.trim() || "";
  const description = (value.description as string | undefined)?.trim() || "";
  if (rawUrl && !url) throw new Error("Use a public YouTube watch or youtu.be link.");
  if (!url && transcript.length < 30) throw new Error("Paste a transcript with at least 30 characters.");
  if (transcript.length > 150000 || description.length > 20000) throw new Error("This transcript is too long (150,000 characters maximum).");
  return { url, transcript, description };
}
