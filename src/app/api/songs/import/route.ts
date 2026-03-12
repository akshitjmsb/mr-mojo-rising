import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];
type ProcessingJob = Database["public"]["Tables"]["processing_jobs"]["Row"];

async function getOwnerUserId(): Promise<string | null> {
  const email = process.env.VOICE_LOGIN_EMAIL;
  if (!email) return null;
  const admin = createAdminClient();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

export async function POST(request: Request) {
  try {
    const { youtube_url } = await request.json();

    if (!youtube_url || typeof youtube_url !== "string") {
      return NextResponse.json(
        { error: "YouTube URL is required" },
        { status: 400 }
      );
    }

    // Basic YouTube URL validation
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/;
    if (!ytRegex.test(youtube_url)) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const userId = await getOwnerUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Owner user not found. Run: npm run auth:ensure-voice-user" },
        { status: 500 }
      );
    }

    // Create song record
    const { data: song, error: songError } = await supabase
      .from("songs")
      .insert({
        user_id: userId,
        title: "Processing...",
        youtube_url,
        status: "queued",
        processing_stage: "queued",
        last_error: null,
      })
      .select()
      .single();

    if (songError || !song) {
      return NextResponse.json(
        { error: "Failed to create song record" },
        { status: 500 }
      );
    }

    const songRow = song as Song;

    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        song_id: songRow.id,
        user_id: userId,
        youtube_url,
        status: "queued",
      })
      .select()
      .single();

    if (jobError || !job) {
      await supabase
        .from("songs")
        .update({
          status: "failed",
          processing_stage: "failed",
          last_error: "Failed to queue processing job",
        })
        .eq("id", songRow.id);

      return NextResponse.json(
        { error: "Failed to queue processing job" },
        { status: 500 }
      );
    }

    const jobRow = job as ProcessingJob;

    return NextResponse.json({
      id: songRow.id,
      status: songRow.status,
      job_id: jobRow.id,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
