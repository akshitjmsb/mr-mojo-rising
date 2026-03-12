import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];
type ProcessingJob = Database["public"]["Tables"]["processing_jobs"]["Row"];

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

    // Create song record
    const { data: song, error: songError } = await supabase
      .from("songs")
      .insert({
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
