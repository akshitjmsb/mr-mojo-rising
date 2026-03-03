import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VOICE_UNLOCK_COOKIE } from "@/lib/voice-auth";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: VOICE_UNLOCK_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  return response;
}
