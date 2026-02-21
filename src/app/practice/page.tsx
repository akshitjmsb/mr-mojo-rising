"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";
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
      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Header />
        <TabNav />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
        <Footer />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
      }}
    >
      <Header />
      <TabNav />
      <div style={{ flex: 1, padding: 24, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
      <Footer />
    </div>
  );
}
