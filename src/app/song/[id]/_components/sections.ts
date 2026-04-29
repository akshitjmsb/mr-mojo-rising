const SECTION_COLORS: Record<string, string> = {
  Intro: "#D4A844",
  "Verse I": "#C8844A",
  "Verse II": "#C8844A",
  "Verse III": "#C8844A",
  Chorus: "#B85C3A",
  Break: "#8A6A9A",
  Bridge: "#8A6A9A",
  Solo: "#D4A844",
  Outro: "#D4A844",
};

export function getSectionColor(label: string): string {
  return SECTION_COLORS[label] ?? "#C8844A";
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
