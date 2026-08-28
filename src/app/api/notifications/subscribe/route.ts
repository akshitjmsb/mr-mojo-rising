import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getTursoClient } from "@/lib/turso";

type SubscriptionRequest = {
  song_id?: unknown;
  subscription?: {
    endpoint?: unknown;
    keys?: {
      p256dh?: unknown;
      auth?: unknown;
    };
  };
};

async function ensureSubscriptionTable() {
  const client = getTursoClient();
  await client.execute(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    notified_at INTEGER,
    UNIQUE (song_id, endpoint)
  )`);
}

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json(
      { error: "Ready notifications are not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { publicKey },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubscriptionRequest;
    const songId = body.song_id;
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;

    if (
      typeof songId !== "string" ||
      typeof endpoint !== "string" ||
      typeof p256dh !== "string" ||
      typeof auth !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid notification subscription" },
        { status: 400 },
      );
    }

    await ensureSubscriptionTable();
    const client = getTursoClient();
    const songResult = await client.execute({
      sql: "SELECT status, processing_stage FROM songs WHERE id = ?",
      args: [songId],
    });
    const song = songResult.rows[0];
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    await client.execute({
      sql: `INSERT INTO push_subscriptions
              (id, song_id, endpoint, p256dh, auth)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(song_id, endpoint) DO UPDATE SET
              p256dh = excluded.p256dh,
              auth = excluded.auth,
              notified_at = NULL,
              updated_at = unixepoch()`,
      args: [randomUUID(), songId, endpoint, p256dh, auth],
    });

    const ready = song.status === "ready" && song.processing_stage === "complete";
    return NextResponse.json({ subscribed: true, ready });
  } catch (error) {
    console.error("Notification subscription failed", error);
    return NextResponse.json(
      { error: "Could not enable ready notification" },
      { status: 500 },
    );
  }
}
