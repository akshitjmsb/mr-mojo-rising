export type Theme = "doors" | "eagles" | "dylan";

export const THEMES: readonly Theme[] = ["doors", "eagles", "dylan"] as const;

export const DEFAULT_THEME: Theme = "doors";

export const THEME_COLORS: Record<Theme, string> = {
  doors: "#0A0806",
  eagles: "#F1E4C5",
  dylan: "#15110A",
};

export const THEME_FAVICONS: Record<Theme, string> = {
  doors: "/favicon.svg",
  eagles: "/favicon-eagles.svg",
  dylan: "/favicon-dylan.svg",
};
