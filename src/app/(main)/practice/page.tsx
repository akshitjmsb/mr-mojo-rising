"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Song } from "@/lib/database.types";

export default function PracticePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkLastSong() {
      try {
        const res = await fetch("/api/songs", { cache: "no-store" });
        const data = (await res.json()) as Song[];
        const ready = Array.isArray(data)
          ? data.find((song) => song.status === "ready")
          : null;
        if (ready) {
          router.replace(`/song/${ready.id}`);
          return;
        }
      } catch {
        // fall through to "no songs ready" state
      }
      setChecked(true);
    }
    checkLastSong();
  }, [router]);

  if (!checked) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <svg
          className="spinning"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <p className="font-josefin text-[12px] font-thin leading-[1.8] tracking-[0.1em] text-text-muted">
        No songs ready to practice yet.
        <br />
        Import one to get started.
      </p>
    </div>
  );
}
