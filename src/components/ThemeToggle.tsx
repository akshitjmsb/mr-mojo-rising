"use client";

import { useTheme } from "@/lib/theme/ThemeProvider";
import { THEMES, type Theme } from "@/lib/theme/types";

const LABELS: Record<Theme, string> = {
  doors: "Doors",
  dylan: "Dylan",
  ali: "Ali",
};

/**
 * Theme cycler. Each theme shows its signature glyph: Doors → crescent moon
 * (after-hours dive bar); Dylan → harmonica (the road, the protest, the
 * typewriter); Ali → raindrop (monsoon evening). Tapping cycles forward.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme, content } = useTheme();
  const idx = THEMES.indexOf(theme);
  const next = THEMES[(idx + 1) % THEMES.length];

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${LABELS[next]} theme`}
      title={`${content.label} theme — tap for ${LABELS[next]}`}
      className="group flex h-7 items-center gap-1.5 rounded-full border border-border-darkest bg-transparent px-2.5 font-josefin text-[8px] font-light uppercase tracking-[0.22em] text-text-darkest transition-colors duration-300 hover:border-gold hover:text-gold"
    >
      {theme === "doors" && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* Crescent moon — Doors after-hours */}
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      {theme === "dylan" && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* Harmonica — Dylan's signature instrument */}
          <rect x="3" y="9" width="18" height="6" rx="0.8" />
          <line x1="6.6" y1="9" x2="6.6" y2="15" />
          <line x1="9.6" y1="9" x2="9.6" y2="15" />
          <line x1="12.6" y1="9" x2="12.6" y2="15" />
          <line x1="15.6" y1="9" x2="15.6" y2="15" />
          <line x1="18.6" y1="9" x2="18.6" y2="15" />
        </svg>
      )}
      {theme === "ali" && (
        <svg
          width="10"
          height="12"
          viewBox="0 0 20 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* Raindrop — monsoon evening, Lucky Ali's rain-soaked acoustic world */}
          <path d="M10 2 C10 2 2 12 2 16 a8 8 0 0 0 16 0 C18 12 10 2 10 2 Z" />
        </svg>
      )}
      <span>{content.label}</span>
    </button>
  );
}
