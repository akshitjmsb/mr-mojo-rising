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

function megabytes(bytes: number) {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

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
        // Capacity is helpful context; it must never block the catalog.
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!usage) return null;

  const percentage = Math.min(
    100,
    Math.max(0, (usage.used_bytes / usage.limit_bytes) * 100),
  );
  const songsRemaining = usage.estimated_songs_remaining;
  const nearlyFull = songsRemaining !== null && songsRemaining < 3;

  return (
    <section
      aria-label="Song storage"
      className={`mx-5 mb-4 border p-3.5 ${
        nearlyFull ? "border-terracotta/60" : "border-border-dark"
      }`}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-muted">
            Song storage
          </p>
          <p className="mt-1 font-playfair text-[17px] italic text-text">
            {songsRemaining === null
              ? "Ready for songs"
              : `About ${songsRemaining} song${songsRemaining === 1 ? "" : "s"} left`}
          </p>
        </div>
        <p className="shrink-0 font-josefin text-[8px] tabular-nums tracking-[0.08em] text-text-dark">
          {megabytes(usage.used_bytes)} / 1 GB
        </p>
      </div>
      <div
        className="mt-3 h-px bg-border-dark"
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
      <p
        className={`mt-2 font-josefin text-[7px] uppercase leading-relaxed tracking-[0.08em] ${
          nearlyFull ? "text-terracotta" : "text-text-darkest"
        }`}
      >
        {nearlyFull
          ? "Storage nearly full · delete a finished song before adding more"
          : "Stored songs keep counting until you delete them"}
      </p>
    </section>
  );
}
