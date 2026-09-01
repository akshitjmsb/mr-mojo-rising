"use client";

import { useEffect, useState } from "react";

export type StorageUsage = {
  used_bytes: number;
  limit_bytes: number;
  remaining_bytes: number;
  song_count: number;
  average_song_bytes: number;
  estimated_songs_remaining: number | null;
};

type Props = {
  refreshKey: number;
};

export default function StorageMeter({ refreshKey }: Props) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/storage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((nextUsage: StorageUsage | null) => {
        if (!cancelled && nextUsage) setUsage(nextUsage);
      })
      .catch(() => {
        // Capacity context must never block the catalog.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!usage) return null;

  const songsRemaining = usage.estimated_songs_remaining;
  const nearlyFull = songsRemaining !== null && songsRemaining <= 3;
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
