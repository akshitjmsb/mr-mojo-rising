"use client";

import { useCallback, useEffect, useState } from "react";

type State =
  | "checking"
  | "idle"
  | "enabling"
  | "enabled"
  | "needs-home-screen"
  | "denied"
  | "unsupported"
  | "error";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

async function saveSubscription(songId: string, subscription: PushSubscription) {
  const response = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      song_id: songId,
      subscription: subscription.toJSON(),
    }),
  });
  const data = (await response.json()) as {
    subscribed?: boolean;
    ready?: boolean;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Subscription failed");
  return data;
}

export default function SongReadyNotification({ songId }: { songId: string | null }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    if (!songId) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState(isIos() && !isStandalone() ? "needs-home-screen" : "unsupported");
      return;
    }
    if (!("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    let cancelled = false;
    async function restoreExistingSubscription() {
      if (Notification.permission !== "granted") {
        setState("idle");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          if (!cancelled) setState("idle");
          return;
        }
        await saveSubscription(songId!, subscription);
        if (!cancelled) setState("enabled");
      } catch {
        if (!cancelled) setState("idle");
      }
    }
    void restoreExistingSubscription();
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const enable = useCallback(async () => {
    if (!songId || !("Notification" in window)) return;
    setState("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const [registration, configResponse] = await Promise.all([
        navigator.serviceWorker.register("/sw.js"),
        fetch("/api/notifications/subscribe", { cache: "no-store" }),
      ]);
      const config = (await configResponse.json()) as {
        publicKey?: string;
        error?: string;
      };
      if (!configResponse.ok || !config.publicKey) {
        throw new Error(config.error || "Notifications are not configured");
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        }));
      const saved = await saveSubscription(songId, subscription);
      setState("enabled");

      if (saved.ready) {
        await registration.showNotification("Your song is ready", {
          body: "Open Mr. Mojo Rising to play it.",
          icon: "/icon-192.png",
          tag: `song-ready-${songId}`,
          data: { url: `/song/${songId}` },
        });
      }
    } catch (error) {
      console.error("Could not enable ready notification", error);
      setState("error");
    }
  }, [songId]);

  if (state === "checking") return null;
  if (state === "enabled") {
    return (
      <p className="font-josefin text-[10px] uppercase tracking-[0.18em] text-gold">
        ✓ Notification set · You can leave
      </p>
    );
  }
  if (state === "needs-home-screen") {
    return (
      <p className="max-w-[310px] font-josefin text-[10px] leading-[1.7] tracking-[0.08em] text-text-muted">
        For a ready alert on iPhone: open in Safari, Share → Add to Home Screen.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="font-josefin text-[10px] tracking-[0.08em] text-text-muted">
        Notifications are blocked in browser settings.
      </p>
    );
  }
  if (state === "unsupported") return null;

  return (
    <button
      type="button"
      onClick={enable}
      disabled={state === "enabling"}
      className="min-w-[260px] border border-gold px-5 py-3 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold disabled:opacity-50"
    >
      {state === "enabling"
        ? "Enabling notification..."
        : state === "error"
          ? "Try notification again"
          : "Notify me when ready"}
    </button>
  );
}
