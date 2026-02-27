"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
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
      {/* Logo */}
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

      {/* Login form */}
      <form
        onSubmit={handleLogin}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <label
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
          }}
        >
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="rider@thedoors.com"
          required
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.06em",
            padding: "14px 16px",
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            outline: "none",
            width: "100%",
          }}
        />

        <label
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 11,
            fontWeight: 400,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--color-text-muted)",
            marginTop: 8,
          }}
        >
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 13,
            fontWeight: 400,
            letterSpacing: "0.06em",
            padding: "14px 16px",
            background: "var(--color-input-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
            outline: "none",
            width: "100%",
          }}
        />

        {error && (
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: "var(--color-terracotta)",
              letterSpacing: "0.06em",
              marginTop: 4,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
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
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "background 0.25s, opacity 0.25s",
            width: "100%",
            marginTop: 8,
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Sign up link */}
      <p
        style={{
          fontFamily: "var(--font-josefin), sans-serif",
          fontSize: 12,
          fontWeight: 300,
          letterSpacing: "0.06em",
          color: "var(--color-text-muted)",
          textAlign: "center",
          marginTop: 24,
        }}
      >
        No account?{" "}
        <Link
          href="/signup"
          style={{
            color: "var(--color-gold)",
            textDecoration: "none",
          }}
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
