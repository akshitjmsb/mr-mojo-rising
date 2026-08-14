import { NextResponse } from "next/server";
import { searchYouTube } from "@/lib/youtube-search";

export async function GET(request: Request) {
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
    const results = await searchYouTube(q, maxResults);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("[api/youtube/search] failed", {
      query: q,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "YouTube search is temporarily unavailable. Paste a YouTube link instead." },
      { status: 502 },
    );
  }
}
