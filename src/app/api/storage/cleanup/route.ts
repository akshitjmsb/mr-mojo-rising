import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { retryBlobCleanup } from "@/lib/blob-cleanup";

export async function POST(request: Request) {
  const expected = Buffer.from(process.env.API_SECRET || "");
  const authorization = request.headers.get("authorization");
  const supplied = Buffer.from(authorization?.startsWith("Bearer ") ? authorization.slice(7) : "");
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await retryBlobCleanup());
  } catch (error) {
    console.error("[blob-cleanup] unavailable", error);
    return NextResponse.json({ error: "Cleanup temporarily unavailable" }, { status: 503 });
  }
}
