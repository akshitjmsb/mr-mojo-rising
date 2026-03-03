"use client";

import dynamic from "next/dynamic";

const VoiceLoginClient = dynamic(() => import("@/components/auth/VoiceLoginClient"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h1
          className="flicker"
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: 32,
            fontWeight: 900,
            fontStyle: "italic",
            letterSpacing: "-0.01em",
            lineHeight: 1,
            color: "var(--color-text)",
          }}
        >
          Mr. Mojo Rising
        </h1>
        <p
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 11,
            fontWeight: 300,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "var(--color-gold)",
            marginTop: 8,
          }}
        >
          Guitar Practice Studio
        </p>
      </div>

      <div style={{ textAlign: "center" }}>
        <p
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontSize: 20,
            fontWeight: 700,
            fontStyle: "italic",
            color: "var(--color-text)",
            marginBottom: 12,
          }}
        >
          Voice Unlock
        </p>
        <p
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 13,
            fontWeight: 300,
            letterSpacing: "0.08em",
            lineHeight: 1.8,
            color: "var(--color-text-muted)",
            marginBottom: 20,
          }}
        >
          Preparing voice unlock...
        </p>
        <button
          type="button"
          disabled
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            padding: "14px 24px",
            background: "transparent",
            border: "1px solid var(--color-gold)",
            color: "var(--color-gold)",
            cursor: "default",
            opacity: 0.5,
            transition: "background 0.25s, opacity 0.25s",
            width: "100%",
          }}
        >
          Loading...
        </button>
      </div>
    </div>
  ),
});

export default function LoginClientOnly() {
  return <VoiceLoginClient />;
}
