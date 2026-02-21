import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];

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

    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Create song record
    const { data: song, error: songError } = await supabase
      .from("songs")
      .insert({
        user_id: user.id,
        title: "Processing...",
        youtube_url,
        status: "pending",
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

    // Call Mac FastAPI server to start processing
    const macApiUrl = process.env.MAC_API_URL;
    const macApiSecret = process.env.MAC_API_SECRET;

    if (macApiUrl) {
      try {
        await fetch(`${macApiUrl}/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${macApiSecret}`,
          },
          body: JSON.stringify({
            song_id: songRow.id,
            youtube_url,
          }),
        });

        // Update status to processing
        await supabase
          .from("songs")
          .update({ status: "processing" as const })
          .eq("id", songRow.id);
      } catch {
        // Mac server not available — song stays in pending state
        console.error("Mac server not available");
      }
    }

    return NextResponse.json(songRow);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
