import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  VOICE_UNLOCK_COOKIE,
  createVoiceSessionCookieValue,
  normalizeVoiceInput,
} from "@/lib/voice-auth";

type AttemptState = {
  failures: number;
  lockedUntil: number;
};
type VoiceProfile = {
  vector: number[];
};

const attemptsByIp = new Map<string, AttemptState>();
const MAX_FAILURES = 5;
const LOCK_MS = 30_000;
const MIN_VOICEPRINT_LEN = 16;
const VOICEPRINT_THRESHOLD = Number(process.env.VOICEPRINT_THRESHOLD || "0.9");

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || "local";
}

function isLocked(ip: string, now: number): boolean {
  const state = attemptsByIp.get(ip);
  if (!state) return false;
  if (state.lockedUntil > now) return true;
  if (state.lockedUntil > 0 && state.lockedUntil <= now) {
    attemptsByIp.delete(ip);
  }
  return false;
}

function recordFailure(ip: string, now: number): void {
  const prev = attemptsByIp.get(ip) ?? { failures: 0, lockedUntil: 0 };
  const nextFailures = prev.failures + 1;
  if (nextFailures >= MAX_FAILURES) {
    attemptsByIp.set(ip, { failures: 0, lockedUntil: now + LOCK_MS });
    return;
  }
  attemptsByIp.set(ip, { failures: nextFailures, lockedUntil: 0 });
}

function clearFailures(ip: string): void {
  attemptsByIp.delete(ip);
}

function isValidVoiceprint(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length < MIN_VOICEPRINT_LEN) return false;
  return value.every((num) => typeof num === "number" && Number.isFinite(num));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

type AuthUserLike = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createAdminClient>,
  email: string
): Promise<AuthUserLike | null> {
  if (!adminClient) return null;

  let page = 1;
  const perPage = 200;
  const target = email.toLowerCase();

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found as AuthUserLike;
    if (data.users.length < perPage) return null;

    page += 1;
  }
}

function readVoiceProfileFromMetadata(user: AuthUserLike): VoiceProfile | null {
  const raw = user.user_metadata?.voice_profile_vector;
  if (!isValidVoiceprint(raw)) return null;
  return { vector: raw };
}

export async function POST(request: Request) {
  const now = Date.now();
  const ip = getClientIp(request);

  if (isLocked(ip, now)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in 30 seconds." },
      { status: 429 }
    );
  }

  let transcript = "";
  let voiceprint: number[] | null = null;

  try {
    const body = await request.json();
    transcript = body?.transcript;
    voiceprint = body?.voiceprint ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof transcript !== "string" || transcript.trim().length === 0) {
    return NextResponse.json({ error: "Transcript is required" }, { status: 400 });
  }
  if (!isValidVoiceprint(voiceprint)) {
    return NextResponse.json({ error: "Voiceprint is required" }, { status: 400 });
  }

  const voicePassphrase = process.env.VOICE_PASSPHRASE;
  const voiceLoginEmail = process.env.VOICE_LOGIN_EMAIL;
  const voiceLoginPassword = process.env.VOICE_LOGIN_PASSWORD;
  const voiceCookieSecret = process.env.VOICE_COOKIE_SECRET;

  if (!voicePassphrase || !voiceLoginEmail || !voiceLoginPassword || !voiceCookieSecret) {
    return NextResponse.json(
      { error: "Voice authentication is not configured" },
      { status: 500 }
    );
  }

  const transcriptNorm = normalizeVoiceInput(transcript);
  const expectedNorm = normalizeVoiceInput(voicePassphrase);

  if (!expectedNorm || transcriptNorm !== expectedNorm) {
    recordFailure(ip, now);
    return NextResponse.json({ error: "Voice authentication failed" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Voice authentication is not configured" },
      { status: 500 }
    );
  }

  const ownerUser = await findAuthUserByEmail(adminClient, voiceLoginEmail);
  if (!ownerUser) {
    return NextResponse.json(
      { error: "Voice auth user was not found. Run auth:ensure-voice-user." },
      { status: 500 }
    );
  }

  const profile = readVoiceProfileFromMetadata(ownerUser);
  let enrolled = false;

  if (!profile) {
    const metadata = {
      ...(ownerUser.user_metadata || {}),
      voice_profile_vector: voiceprint,
      voice_profile_updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await adminClient.auth.admin.updateUserById(ownerUser.id, {
      user_metadata: metadata,
    });
    if (updateError) {
      return NextResponse.json(
        { error: "Failed to enroll owner voice profile" },
        { status: 500 }
      );
    }
    enrolled = true;
  } else {
    const similarity = cosineSimilarity(profile.vector, voiceprint);
    if (!Number.isFinite(similarity) || similarity < VOICEPRINT_THRESHOLD) {
      recordFailure(ip, now);
      return NextResponse.json(
        { error: "Voice does not match owner profile" },
        { status: 401 }
      );
    }
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: voiceLoginEmail,
    password: voiceLoginPassword,
  });

  if (error) {
    return NextResponse.json(
      { error: "Voice authentication unavailable" },
      { status: 500 }
    );
  }

  clearFailures(ip);

  const response = NextResponse.json({ ok: true, enrolled });
  response.cookies.set({
    name: VOICE_UNLOCK_COOKIE,
    value: createVoiceSessionCookieValue(voiceCookieSecret, voiceLoginEmail),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
