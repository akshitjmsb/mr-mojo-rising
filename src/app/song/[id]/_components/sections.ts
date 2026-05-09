// Section pill colors are theme-driven via CSS variables (see globals.css).
const SECTION_VARS: Record<string, string> = {
  Intro: "var(--section-intro)",
  "Verse I": "var(--section-verse)",
  "Verse II": "var(--section-verse)",
  "Verse III": "var(--section-verse)",
  Chorus: "var(--section-chorus)",
  Break: "var(--section-bridge)",
  Bridge: "var(--section-bridge)",
  Solo: "var(--section-intro)",
  Outro: "var(--section-intro)",
};

export function getSectionColor(label: string): string {
  return SECTION_VARS[label] ?? "var(--section-default)";
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
