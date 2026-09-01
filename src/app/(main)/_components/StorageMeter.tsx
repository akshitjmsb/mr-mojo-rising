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
    void fetch("/api/storage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((nextUsage: StorageUsage | null) => {
        if (!cancelled && nextUsage) {
          setUsage(nextUsage);
          onUsage?.(nextUsage);
        }
      })
      .catch(() => {
        // Capacity context must never block the catalog.
      });
    return () => {
      cancelled = true;
    };
  }, [onUsage, refreshKey]);

  if (!usage) return null;

  const songsRemaining = usage.estimated_songs_remaining;
  const nearlyFull = songsRemaining !== null && songsRemaining <= 3;
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

  const capacity =
    songsRemaining === null
      ? `${Math.round(usage.used_bytes / 1_000_000)} MB used`
      : `Space for about ${songsRemaining} more song${songsRemaining === 1 ? "" : "s"}`;

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
