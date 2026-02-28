"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

type Song = Database["public"]["Tables"]["songs"]["Row"];

export default function LibraryPage() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSongs() {
      const supabase = createClient();
      const { data } = await supabase
        .from("songs")
        .select("*")
        .order("created_at", { ascending: false });

      setSongs((data as Song[]) || []);
      setLoading(false);
    }

    fetchSongs();
  }, []);

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

      <main style={{ flex: 1 }}>
        {/* Song count */}
        <div style={{ padding: "16px 20px 10px" }}>
          <p
            style={{
              fontFamily: "var(--font-josefin), sans-serif",
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            {loading ? "Loading..." : `${songs.length} song${songs.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Song list */}
        <div>
          {songs.map((song) => (
            <button
              key={song.id}
              onClick={() => {
                if (song.status === "ready") {
                  router.push(`/song/${song.id}`);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 20px",
                width: "100%",
                borderBottom: "1px solid var(--color-border-darkest)",
                background: "transparent",
                border: "none",
                borderBlockEnd: "1px solid var(--color-border-darkest)",
                cursor: song.status === "ready" ? "pointer" : "default",
                textAlign: "left",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                if (song.status === "ready") {
                  e.currentTarget.style.background = "rgba(212,168,68,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Play icon / Spinner */}
              <div
                style={{
                  width: 38,
                  height: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--color-border)",
                  flexShrink: 0,
                }}
              >
                {song.status === "processing" ? (
                  <svg
                    className="spinning"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                ) : song.status === "ready" ? (
                  <svg
                    width="12"
                    height="14"
                    viewBox="0 0 12 14"
                    fill="var(--color-text-muted)"
                  >
                    <path d="M0 0L12 7L0 14V0Z" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                )}
              </div>

              {/* Song info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "var(--font-playfair), Georgia, serif",
                    fontSize: 14,
                    fontStyle: "italic",
                    color: "var(--color-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {song.title}
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-josefin), sans-serif",
                    fontSize: 10,
                    fontWeight: 100,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--color-text-dark)",
                    marginTop: 2,
                  }}
                >
                  {song.artist || "Unknown Artist"}
                </p>
              </div>

              {/* Status */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {song.status === "processing" && (
                  <p
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 9,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: "var(--color-orange)",
                    }}
                  >
                    Processing
                  </p>
                )}
                {song.status === "queued" && (
                  <p
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 9,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Queued
                  </p>
                )}
                {song.status === "failed" && (
                  <p
                    style={{
                      fontFamily: "var(--font-josefin), sans-serif",
                      fontSize: 9,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: "var(--color-terracotta)",
                    }}
                  >
                    Failed
                  </p>
                )}
              </div>
            </button>
          ))}

          {!loading && songs.length === 0 && (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <p
                style={{
                  fontFamily: "var(--font-josefin), sans-serif",
                  fontSize: 12,
                  fontWeight: 100,
                  letterSpacing: "0.1em",
                  color: "var(--color-text-muted)",
                  lineHeight: 1.8,
                }}
              >
                No songs yet. Import one to get started.
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
