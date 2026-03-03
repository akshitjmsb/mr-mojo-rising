import crypto from "node:crypto";

export const VOICE_UNLOCK_COOKIE = "mmr_voice_unlock";

export type VoiceSessionPayload = {
  v: 1;
  iat: number;
  login: string;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function normalizeVoiceInput(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

export function createVoiceSessionCookieValue(secret: string, login: string): string {
  const payload: VoiceSessionPayload = {
    v: 1,
    iat: Date.now(),
    login,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyVoiceSessionCookie(
  cookieValue: string | undefined,
  secret: string | undefined
): VoiceSessionPayload | null {
  if (!cookieValue || !secret) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;

  const [payloadEncoded, signature] = parts;
  const expectedSignature = sign(payloadEncoded, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as VoiceSessionPayload;
    if (payload?.v !== 1 || typeof payload.iat !== "number" || typeof payload.login !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
