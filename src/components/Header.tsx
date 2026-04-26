import Link from "next/link";

interface HeaderProps {
  songTitle?: string;
  songArtist?: string;
  backHref?: string;
}

export default function Header({ songTitle, songArtist, backHref }: HeaderProps) {
  return (
    <header>
      <div className="flex items-start justify-between" style={{ padding: "22px 20px 0", gap: 12 }}>
        {/* Back button */}
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              marginTop: 2,
              color: "var(--color-text-muted)",
              textDecoration: "none",
              border: "1px solid var(--color-border-dark)",
              borderRadius: 1,
              flexShrink: 0,
              transition: "color 0.2s, border-color 0.2s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
        )}

        {/* Logo */}
        <div style={{ flex: 1 }}>
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
          ) : null}
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
