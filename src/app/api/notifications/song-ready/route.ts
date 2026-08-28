import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import webpush from "web-push";
import { getTursoClient } from "@/lib/turso";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function validBearer(request: Request) {
  const expected = process.env.API_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request: Request) {
  if (!validBearer(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { error: "Ready notifications are not configured" },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as { song_id?: unknown };
    if (typeof body.song_id !== "string") {
      return NextResponse.json({ error: "song_id is required" }, { status: 400 });
    }

    const client = getTursoClient();
    const songResult = await client.execute({
      sql: `SELECT title, artist, status, processing_stage
            FROM songs WHERE id = ?`,
      args: [body.song_id],
    });
    const song = songResult.rows[0];
    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }
    if (song.status !== "ready" || song.processing_stage !== "complete") {
      return NextResponse.json({ error: "Song is not ready" }, { status: 409 });
    }

    const subscriptionResult = await client.execute({
      sql: `SELECT id, endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE song_id = ? AND notified_at IS NULL`,
      args: [body.song_id],
    });
    const subscriptions = subscriptionResult.rows as unknown as SubscriptionRow[];

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "https://mr-mojo-rising.vercel.app",
      publicKey,
      privateKey,
    );

    const title = String(song.title || "Your song");
    const artist = song.artist ? String(song.artist) : "";
    const payload = JSON.stringify({
      title: "Your song is ready",
      body: artist ? `${title} · ${artist}` : title,
      url: `/song/${body.song_id}`,
      tag: `song-ready-${body.song_id}`,
    });

    let sent = 0;
    let removed = 0;
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
            { TTL: 60 * 60 * 12, urgency: "normal" },
          );
          sent += 1;
          await client.execute({
            sql: `UPDATE push_subscriptions
                  SET notified_at = unixepoch(), updated_at = unixepoch()
                  WHERE id = ?`,
            args: [subscription.id],
          });
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            removed += 1;
            await client.execute({
              sql: "DELETE FROM push_subscriptions WHERE id = ?",
              args: [subscription.id],
            });
            return;
          }
          console.error("Ready push failed", {
            subscriptionId: subscription.id,
            statusCode,
            error: String(error),
          });
        }
      }),
    );

    return NextResponse.json({ subscriptions: subscriptions.length, sent, removed });
  } catch (error) {
    console.error("Song-ready notification failed", error);
    return NextResponse.json(
      { error: "Could not send ready notification" },
      { status: 500 },
    );
  }
}
