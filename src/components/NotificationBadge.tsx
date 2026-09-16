"use client";

import { useEffect } from "react";

/** Opening the app acknowledges the song-ready indicator, not push permission. */
export default function NotificationBadge() {
  useEffect(() => {
    const clear = () => {
      if (document.visibilityState !== "visible") return;
      if ("clearAppBadge" in navigator) void navigator.clearAppBadge().catch(() => {});
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistration().then(registration => {
          registration?.active?.postMessage({ type: "CLEAR_BADGE" });
        }).catch(() => {});
      }
    };
    clear();
    window.addEventListener("focus", clear);
    window.addEventListener("pageshow", clear);
    document.addEventListener("visibilitychange", clear);
    // Update existing installs even if the user never visits Add Song again.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", clear);
    }
    return () => {
      window.removeEventListener("focus", clear);
      window.removeEventListener("pageshow", clear);
      document.removeEventListener("visibilitychange", clear);
      navigator.serviceWorker?.removeEventListener("controllerchange", clear);
    };
  }, []);
  return null;
}
