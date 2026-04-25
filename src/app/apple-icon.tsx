import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: "#050403",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Atmospheric amber bloom */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 52%, rgba(234,192,94,0.18) 0%, transparent 100%)",
        }}
      />

      <svg viewBox="0 0 100 100" width="180" height="180">
        <defs>
          <radialGradient id="portal" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#FFF8D8" />
            <stop offset="22%" stopColor="#F7CC48" />
            <stop offset="58%" stopColor="#C47818" />
            <stop offset="100%" stopColor="#5A2C08" />
          </radialGradient>
          <linearGradient id="frame" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9A6828" />
            <stop offset="100%" stopColor="#4E3012" />
          </linearGradient>
          <linearGradient id="keystone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C08030" />
            <stop offset="100%" stopColor="#8A5520" />
          </linearGradient>
        </defs>

        {/* Arch frame — spring line y=50, outer radius 40 */}
        <path d="M 10 92 L 10 50 A 40 40 0 0 1 90 50 L 90 92 Z" fill="url(#frame)" />

        {/* Arch opening — golden light, inner radius 32 */}
        <path d="M 18 92 L 18 50 A 32 32 0 0 1 82 50 L 82 92 Z" fill="url(#portal)" />

        {/* Keystone at crown */}
        <polygon points="43,20 44.5,8 55.5,8 57,20" fill="url(#keystone)" />
        <line x1="50" y1="8" x2="50" y2="20" stroke="#3A1E08" strokeWidth="0.9" opacity="0.55" />

        {/* Soft halo at crown of arch interior */}
        <ellipse cx="50" cy="38" rx="14" ry="9" fill="#FFF8D8" opacity="0.30" />

        {/* Threshold / floor bar */}
        <rect x="18" y="88" width="64" height="4" rx="0.5" fill="#3A2010" opacity="0.75" />

        {/* Inner-edge shadow for depth */}
        <path
          d="M 18 92 L 18 50 A 32 32 0 0 1 82 50 L 82 92 Z"
          fill="none"
          stroke="#050403"
          strokeWidth="1.5"
          opacity="0.28"
        />
      </svg>
    </div>,
    { ...size }
  );
}
