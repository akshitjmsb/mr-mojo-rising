import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: "#050403",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "19%",
        position: "relative",
      }}
    >
      <svg viewBox="0 0 100 100" width="32" height="32">
        <path
          d="M50 91 C23 68 13 50 13 37 C13 15 29 5 50 5 C71 5 87 15 87 37 C87 50 77 68 50 91Z"
          fill="#EAC05E"
        />
        <path
          d="M34 12 C23 19 17 29 17 39 C17 51 23 63 38 77"
          stroke="rgba(255,248,212,0.35)"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          top: 0,
          left: 0,
          right: 0,
          bottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: "serif",
            fontWeight: 900,
            fontSize: 15,
            color: "#050403",
            lineHeight: 1,
            letterSpacing: "-0.5px",
          }}
        >
          M
        </span>
      </div>
    </div>,
    { ...size }
  );
}
