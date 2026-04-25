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
        borderRadius: "14%",
      }}
    >
      <svg viewBox="0 0 100 100" width="32" height="32">
        <defs>
          <radialGradient id="p" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#FFF8D8" />
            <stop offset="22%" stopColor="#F7CC48" />
            <stop offset="58%" stopColor="#C47818" />
            <stop offset="100%" stopColor="#5A2C08" />
          </radialGradient>
          <linearGradient id="f" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9A6828" />
            <stop offset="100%" stopColor="#4E3012" />
          </linearGradient>
        </defs>
        {/* Arch frame */}
        <path d="M 10 92 L 10 50 A 40 40 0 0 1 90 50 L 90 92 Z" fill="url(#f)" />
        {/* Arch opening — golden light */}
        <path d="M 18 92 L 18 50 A 32 32 0 0 1 82 50 L 82 92 Z" fill="url(#p)" />
        {/* Keystone */}
        <polygon points="43,20 44.5,8 55.5,8 57,20" fill="#B07030" />
      </svg>
    </div>,
    { ...size }
  );
}
