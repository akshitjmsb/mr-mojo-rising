"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { LessonRow } from "@/lib/lesson-types";
const LessonPractice = dynamic(() => import("@/components/lessons/LessonPractice"));

export default function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load the lesson.");
        if (!active) return;
        setLesson(data); setError("");
        if (data.status === "queued" || data.status === "running") timer = setTimeout(poll, 4000);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Connection interrupted."); }
    }
    void poll(); return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [id, attempt]);
  return <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 text-text"><Link href="/lessons" className="mb-6 inline-block py-2 text-xs text-text-muted">← Lessons</Link>
    {error ? <div role="alert"><p className="text-sm text-terracotta">{error}</p><button onClick={() => setAttempt(i => i + 1)} className="mt-3 min-h-11 text-gold">Reconnect</button></div> : lesson?.status === "ready" && lesson.pack ? <LessonPractice pack={lesson.pack} /> : lesson?.status === "failed" ? <div><h1 className="font-playfair text-3xl">Needs another look.</h1><p className="mt-4 text-sm text-text-muted">{lesson.error}</p><Link href="/lessons" className="mt-5 block py-3 text-gold">Try the lesson again →</Link></div> : <div className="py-10 text-center" role="status"><span className="text-5xl text-gold">♬</span><h1 className="mt-5 font-playfair text-3xl">Finding your Mojo.</h1><p className="mt-4 text-sm text-text-muted">{lesson?.stage || "Opening lesson…"}</p><p className="mt-6 text-xs text-text-muted">You can leave this page. Your lesson stays here.</p>{lesson && Date.now() / 1000 - (lesson.heartbeat_at ?? lesson.updated_at) > 180 && <p className="mt-4 text-xs text-terracotta">Still waiting. Check that your Mac is online and the lesson worker is running.</p>}</div>}
  </main>;
}
