export type Theme = "doors" | "dylan" | "ali";

export const THEMES: readonly Theme[] = ["doors", "dylan", "ali"] as const;

export const DEFAULT_THEME: Theme = "doors";

export const THEME_COLORS: Record<Theme, string> = {
  doors: "#0A0806",
  dylan: "#15110A",
  ali: "#080C07",
};

export const THEME_FAVICONS: Record<Theme, string> = {
  doors: "/favicon.svg",
  dylan: "/favicon-dylan.svg",
  ali: "/favicon-ali.svg",
};
