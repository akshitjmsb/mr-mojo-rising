"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { DEFAULT_THEME, THEME_COLORS, THEMES, type Theme } from "./types";
import { getThemeContent, type ThemeContent } from "./content";

export const THEME_STORAGE_KEY = "mojo-theme";
const THEME_CHANGE_EVENT = "mojo:theme-change";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
  content: ThemeContent;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | undefined | null): value is Theme {
  return !!value && (THEMES as readonly string[]).includes(value);
}

function readDocumentTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const fromAttr = document.documentElement.dataset.theme;
  if (isTheme(fromAttr)) return fromAttr;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // localStorage unavailable; fall through to default
  }
  return DEFAULT_THEME;
}

/**
 * Sync the meta theme-color and favicon to the active theme. The pre-paint
 * inline script already stamped data-theme on <html>, so we don't touch that
 * here — overwriting it would clobber the value the script chose for the
 * brief window when useSyncExternalStore still has the SSR snapshot.
 */
function syncBrowserChrome(theme: Theme) {
  if (typeof document === "undefined") return;

  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];

  const iconHref =
    theme === "eagles" ? "/favicon-eagles.svg" : "/favicon.svg";
  const icons = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"], link[rel="shortcut icon"]',
  );
  icons.forEach((link) => {
    link.href = iconHref;
  });
}

function commitTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  syncBrowserChrome(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // best-effort persistence
  }
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    readDocumentTheme,
    () => DEFAULT_THEME,
  );

  const setTheme = useCallback((next: Theme) => {
    commitTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readDocumentTheme() === "doors" ? "eagles" : "doors");
  }, [setTheme]);

  // After hydration the SSR snapshot ("doors") is replaced by the live DOM
  // value (set by the pre-paint script). Dispatch once so the store re-reads
  // and the React tree matches whatever the user actually persisted. Also
  // catch up the meta + favicon which the script doesn't touch.
  useEffect(() => {
    syncBrowserChrome(readDocumentTheme());
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    content: getThemeContent(theme),
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}

/**
 * Inline script body that runs before first paint. Reads the persisted theme
 * from localStorage and stamps it onto <html data-theme="..."> so the CSS
 * variables resolve correctly on the first frame (no flash).
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = (stored === "doors" || stored === "eagles") ? stored : ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", ${JSON.stringify(DEFAULT_THEME)});
  }
})();
`;
