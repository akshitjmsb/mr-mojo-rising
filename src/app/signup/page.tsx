"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
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
            fontSize: 9,
            fontWeight: 100,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "var(--color-gold)",
            marginTop: 8,
          }}
        >
          Guitar Practice Studio
        </p>
      </div>

      {success ? (
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
            Check your email
          </p>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 100,
              letterSpacing: "0.1em",
              lineHeight: 1.8,
              color: "var(--color-text-muted)",
            }}
          >
            We sent a confirmation link to {email}.
            <br />
            Click it to activate your account.
          </p>
          <Link
            href="/login"
            style={{
              display: "inline-block",
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 10,
              fontWeight: 300,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              padding: "14px 24px",
              border: "1px solid var(--color-gold)",
              color: "var(--color-gold)",
              textDecoration: "none",
              marginTop: 24,
            }}
          >
            Back to Sign In
          </Link>
        </div>
      ) : (
        <>
          <form
            onSubmit={handleSignup}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <label
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                fontWeight: 300,
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
                fontSize: 12,
                fontWeight: 300,
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
                fontSize: 9,
                fontWeight: 300,
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
              minLength={6}
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 12,
                fontWeight: 300,
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
                  fontSize: 11,
                  fontWeight: 300,
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
                fontSize: 10,
                fontWeight: 300,
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
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 11,
              fontWeight: 300,
              letterSpacing: "0.06em",
              color: "var(--color-text-muted)",
              textAlign: "center",
              marginTop: 24,
            }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              style={{
                color: "var(--color-gold)",
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
