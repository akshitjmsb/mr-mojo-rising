"use client";

import { useEffect, useState } from "react";

export type StorageUsage = {
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  song_count: number;
  average_song_bytes: number;
  estimated_songs_remaining: number | null;
  song_bytes: Record<string, number>;
};

type Props = {
  refreshKey: number;
  mode: "usage" | "capacity";
  onUsage?: (usage: StorageUsage) => void;
};

export default function StorageMeter({ refreshKey, mode, onUsage }: Props) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    const refresh = () => {
      const currentRequest = ++requestId;
      void fetch("/api/storage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((nextUsage: StorageUsage | null) => {
        if (!cancelled && currentRequest === requestId) {
          setUsage(nextUsage);
          if (nextUsage) onUsage?.(nextUsage);
        }
      })
      .catch(() => {
        if (!cancelled && currentRequest === requestId) setUsage(null);
      });
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onUsage, refreshKey]);

  if (!usage) return null;

  const nearlyFull = usage.remaining_bytes <= usage.limit_bytes * 0.1;
  const percentage = Math.min(
    100,
    Math.max(0, (usage.used_bytes / usage.limit_bytes) * 100),
  );

  if (mode === "usage") {
    return (
      <div className="px-5 pt-3" aria-label="Space utilization">
        <div className="flex items-center justify-between font-josefin text-[8px] uppercase tracking-[0.12em] text-text-dark">
          <span>Space</span>
          <span className={nearlyFull ? "text-terracotta" : undefined}>
            {Math.round(usage.used_bytes / 1_000_000)} MB / 1 GB
          </span>
        </div>
        <div
          className="mt-1.5 h-px bg-border-darkest"
          role="progressbar"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={usage.limit_bytes}
          aria-valuenow={usage.used_bytes}
        >
          <div
            className={`h-full ${nearlyFull ? "bg-terracotta" : "bg-gold"}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }

  const capacity = `${Math.floor(usage.remaining_bytes / 1_000_000)} MB free · ${Math.round(usage.limit_bytes / 1_000_000)} MB total`;

  return (
    <p
      aria-label="Song storage"
      className={`font-josefin text-[8px] uppercase tracking-[0.12em] ${
        nearlyFull ? "text-terracotta" : "text-text-dark"
      }`}
    >
      {capacity}
    </p>
  );
}
