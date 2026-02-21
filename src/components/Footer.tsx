export default function Footer() {
  return (
    <footer
      style={{
        padding: "10px 20px 16px",
        borderTop: "1px solid var(--color-border-darkest)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            flex: 1,
            maxWidth: 60,
            height: 1,
            background: "linear-gradient(to right, transparent, var(--color-border-dark))",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 8,
            fontWeight: 100,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--color-text-darkest)",
            margin: "0 10px",
          }}
        >
          m &middot; m &middot; r
        </span>
        <div
          style={{
            flex: 1,
            maxWidth: 60,
            height: 1,
            background: "linear-gradient(to left, transparent, var(--color-border-dark))",
          }}
        />
      </div>
    </footer>
  );
}
