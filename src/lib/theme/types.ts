export type Theme = "doors" | "eagles";

export const THEMES: readonly Theme[] = ["doors", "eagles"] as const;

export const DEFAULT_THEME: Theme = "doors";

export const THEME_COLORS: Record<Theme, string> = {
  doors: "#0A0806",
  eagles: "#F1E4C5",
};
