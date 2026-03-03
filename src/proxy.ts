import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { VOICE_UNLOCK_COOKIE, verifyVoiceSessionCookie } from "@/lib/voice-auth";

const publicPaths = ["/login", "/auth/callback"];

function clearVoiceCookie(response: NextResponse) {
  response.cookies.set({
    name: VOICE_UNLOCK_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api/");
  const isVoiceApi = pathname.startsWith("/api/auth/voice/");
  const voiceCookieValue = request.cookies.get(VOICE_UNLOCK_COOKIE)?.value;
  const voiceSession = verifyVoiceSessionCookie(voiceCookieValue, process.env.VOICE_COOKIE_SECRET);

  if (isVoiceApi) {
    return supabaseResponse;
  }

  if (isApi) {
    return supabaseResponse;
  }

  if (voiceCookieValue && !voiceSession) {
    if (isPublic) {
      clearVoiceCookie(supabaseResponse);
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    clearVoiceCookie(response);
    return response;
  }

  if (voiceSession && !user) {
    if (isPublic) {
      clearVoiceCookie(supabaseResponse);
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    clearVoiceCookie(response);
    return response;
  }

  // Redirect unauthenticated voice sessions for app routes.
  if (!isPublic && !voiceSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect unlocked users away from login.
  if (voiceSession && user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png|.*\\.svg$).*)",
  ],
};
