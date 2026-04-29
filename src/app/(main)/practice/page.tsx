"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PracticePage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkLastSong() {
      const supabase = createClient();
      const { data } = await supabase
        .from("songs")
        .select("id")
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        router.replace(`/song/${data[0].id}`);
      } else {
        setChecked(true);
      }
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
      <p
        style={{
          fontFamily: "var(--font-josefin), sans-serif",
          fontSize: 12,
          fontWeight: 100,
          letterSpacing: "0.1em",
          color: "var(--color-text-muted)",
          lineHeight: 1.8,
        }}
      >
        No songs ready to practice yet.
        <br />
        Import one to get started.
      </p>
    </div>
  );
}
