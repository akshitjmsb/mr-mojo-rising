"use client";

import { useRouter } from "next/navigation";

interface HeaderProps {
  songTitle?: string;
  songArtist?: string;
}

export default function Header({ songTitle, songArtist }: HeaderProps) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/voice/logout", {
      method: "POST",
    });
    router.push("/");
    router.refresh();
  }

  return (
    <header>
      <div className="flex items-start justify-between" style={{ padding: "22px 20px 0" }}>
        {/* Logo */}
        <div>
          <h1
            className="flicker"
            style={{
              fontFamily: "var(--font-playfair), Georgia, serif",
              fontSize: 26,
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
              marginTop: 6,
            }}
          >
            Guitar Practice Studio
          </p>
        </div>

        {/* Right side: song info or sign out */}
        <div style={{ textAlign: "right" }}>
          {songTitle ? (
            <>
              <p
                style={{
                  fontFamily: "var(--font-playfair), Georgia, serif",
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--color-text-secondary)",
                }}
              >
                {songTitle}
              </p>
              {songArtist && (
                <p
                  style={{
                    fontFamily: "var(--font-josefin), sans-serif",
                    fontSize: 9,
                    fontWeight: 100,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {songArtist}
                </p>
              )}
            </>
          ) : (
            <button
              onClick={handleSignOut}
              style={{
                fontFamily: "var(--font-josefin), sans-serif",
                fontSize: 9,
                fontWeight: 300,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
                transition: "color 0.25s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-gold)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--color-text-muted)";
              }}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Decorative diamond rule */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          marginTop: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(to right, transparent, var(--color-border-dark))",
          }}
        />
        <div
          style={{
            width: 4,
            height: 4,
            background: "var(--color-gold)",
            transform: "rotate(45deg)",
            opacity: 0.6,
            margin: "0 8px",
          }}
        />
        <div
          style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(to left, transparent, var(--color-border-dark))",
          }}
        />
      </div>
    </header>
  );
}
