"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";

const STEPS = [
  { num: "I", text: "Paste a YouTube link to any song" },
  { num: "II", text: "We separate the guitar stem using AI" },
  { num: "III", text: "Sections are detected automatically" },
  { num: "IV", text: "Loop any section at any speed and practice" },
];

export default function ImportPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setImporting(true);
    setError("");
    setLogs(["Validating YouTube URL..."]);

    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to import song");
        setImporting(false);
        return;
      }

      setLogs((prev) => [...prev, "Song queued for processing..."]);
      setLogs((prev) => [...prev, "Sending to stem separator..."]);

      // Poll for status
      const songId = data.id;
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/songs/${songId}/status`);
          const statusData = await statusRes.json();

          if (statusData.status === "ready") {
            clearInterval(poll);
            setLogs((prev) => [...prev, "Processing complete!"]);
            setTimeout(() => router.push(`/song/${songId}`), 800);
          } else if (statusData.status === "failed") {
            clearInterval(poll);
            setError("Processing failed. Please try again.");
            setImporting(false);
          }
        } catch {
          // Continue polling
        }
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(poll), 300000);
    } catch {
      setError("Could not connect to the server. Is the Mac server running?");
      setImporting(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
      }}
    >
      <Header />
      <TabNav />

      <main style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 30 }}>
        {/* Hero text */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: 32,
              fontWeight: 700,
              fontStyle: "italic",
              lineHeight: 1.25,
              color: "var(--color-text)",
            }}
          >
            Break on through
            <br />
            to the other side.
          </p>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 12,
              fontWeight: 100,
              letterSpacing: "0.1em",
              lineHeight: 1.8,
              color: "var(--color-text-muted)",
              marginTop: 14,
            }}
          >
            Paste a YouTube link. We&apos;ll isolate the guitar,
            <br />
            detect the sections, and let you practice at any speed.
          </p>
        </div>

        {/* URL Input Form */}
        <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            disabled={importing}
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
          <button
            type="submit"
            disabled={importing || !url.trim()}
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
              cursor: importing || !url.trim() ? "default" : "pointer",
              opacity: importing || !url.trim() ? 0.5 : 1,
              transition: "background 0.25s, opacity 0.25s",
              width: "100%",
            }}
          >
            {importing ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg
                  className="spinning"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Processing...
              </span>
            ) : (
              "Import Song"
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 11,
              fontWeight: 300,
              color: "var(--color-terracotta)",
              letterSpacing: "0.06em",
            }}
          >
            {error}
          </p>
        )}

        {/* Processing log */}
        {logs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              Processing Log
            </p>
            {logs.map((log, i) => (
              <p
                key={i}
                className="fade-up"
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 11,
                  fontWeight: 300,
                  letterSpacing: "0.06em",
                  color: "var(--color-text-darker)",
                  animationDelay: `${i * 0.15}s`,
                  opacity: 0,
                }}
              >
                {log}
              </p>
            ))}
          </div>
        )}

        {/* How it works */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            How it works
          </p>
          <div
            style={{
              height: 1,
              background: "var(--color-border-dark)",
            }}
          />
          {STEPS.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--color-gold)",
                  opacity: 0.7,
                  minWidth: 20,
                }}
              >
                {step.num}
              </span>
              <p
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 12,
                  fontWeight: 300,
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                  color: "var(--color-text-dark)",
                }}
              >
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
