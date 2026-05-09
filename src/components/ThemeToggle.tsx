"use client";

import { useTheme } from "@/lib/theme/ThemeProvider";

/**
 * Subtle theme switcher. Doors theme shows a moon (psychedelic night vibe);
 * Eagles theme shows a low desert sun (golden-hour). Tapping toggles.
 */
export default function ThemeToggle() {
  const { theme, toggleTheme, content } = useTheme();
  const next = theme === "doors" ? "eagles" : "doors";
  const nextLabel = next === "doors" ? "Doors" : "Eagles";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextLabel} theme`}
      title={`${content.label} theme — tap for ${nextLabel}`}
      className="group flex h-7 items-center gap-1.5 rounded-full border border-border-darkest bg-transparent px-2.5 font-josefin text-[8px] font-light uppercase tracking-[0.22em] text-text-darkest transition-colors duration-300 hover:border-gold hover:text-gold"
    >
      {theme === "doors" ? (
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
      ) : (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* Sun on the horizon — Eagles golden hour */}
          <circle cx="12" cy="13" r="3.4" />
          <path d="M12 6.5V4.5" />
          <path d="M5.6 11.5l-1.4-1" />
          <path d="M18.4 11.5l1.4-1" />
          <path d="M7.5 7.8 6.2 6.5" />
          <path d="M16.5 7.8 17.8 6.5" />
          <path d="M3 18h18" />
        </svg>
      )}
      <span>{content.label}</span>
    </button>
  );
}
