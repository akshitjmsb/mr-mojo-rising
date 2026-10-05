"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LessonRow } from "@/lib/lesson-types";

export default function LessonsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "text">("link");
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [description, setDescription] = useState("");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [worker, setWorker] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/lessons", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) { setLessons(data.lessons); setWorker(data.worker.available ? null : data.worker.message); }
      } catch (error) { if (active) setWorker(error instanceof Error ? error.message : "Could not connect."); }
    }
    void refresh(); const timer = setInterval(refresh, 15000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "link" ? { url } : { transcript, description }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start this lesson.");
      router.push(`/lessons/${data.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not start this lesson."); setBusy(false); }
  }

  return <main className="min-h-0 flex-1 overflow-y-auto px-5 py-7 text-text">
    <p className="font-josefin text-[10px] uppercase tracking-[.25em] text-gold">The lesson, distilled</p>
    <h1 className="mt-2 font-playfair text-4xl leading-tight">Watch less.<br />Play more.</h1>
    <p className="mt-3 text-sm text-text-muted">Your teacher. Their exact shapes. One phrase at a time.</p>
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div className="flex gap-2" aria-label="Lesson input">
        {(["link", "text"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`min-h-11 flex-1 rounded-full border px-4 text-sm ${mode === value ? "border-gold text-gold" : "border-border-dark text-text-muted"}`}>{value === "link" ? "YouTube lesson" : "Paste transcript"}</button>)}
      </div>
      {mode === "link" ? <label className="block text-xs text-text-muted">Lesson link<input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtu.be/…" className="mt-2 w-full rounded-xl border border-border-dark bg-input-bg p-4 text-base text-text outline-gold" /></label> : <>
        <label className="block text-xs text-text-muted">Transcript<textarea required minLength={30} maxLength={150000} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste the teacher’s words, with timestamps if available…" rows={7} className="mt-2 w-full rounded-xl border border-border-dark bg-input-bg p-4 text-base text-text outline-gold" /></label>
        <details className="text-sm text-text-muted"><summary className="cursor-pointer py-2">Description & free resources</summary><label className="block">Video description<textarea maxLength={20000} value={description} onChange={e => setDescription(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-border-dark bg-input-bg p-3 text-text" /></label></details>
      </>}
      <button disabled={busy} className="min-h-14 w-full rounded-xl bg-gold px-5 font-josefin text-base font-semibold text-bg disabled:opacity-50">{busy ? "Opening your lesson…" : "Make it playable  →"}</button>
      {error && <p role="alert" className="text-sm text-terracotta">{error}</p>}
    </form>
    {worker && <details className="mt-5 rounded-xl border border-border-dark p-3 text-xs text-text-muted"><summary className="cursor-pointer">Mac connection needed</summary><p className="mt-2">{worker}</p><p className="mt-2">Run the lesson worker on your Mac with Codex signed in to ChatGPT. Your plan’s usage limits apply.</p></details>}
    <div className="my-7 grid grid-cols-3 gap-2 border-y border-border-darkest py-5 text-center text-xs text-text-muted"><span><b className="mb-2 block text-2xl text-gold">♬</b>Hear it</span><span><b className="mb-2 block text-2xl text-gold">↓ ↑</b>See it</span><span><b className="mb-2 block text-2xl text-gold">↻</b>Make it yours</span></div>
    {lessons.length > 0 && <section><h2 className="mb-3 font-playfair text-xl">Your lessons</h2><div className="space-y-2">{lessons.map(lesson => <Link key={lesson.id} href={`/lessons/${lesson.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border-darkest bg-input-bg p-4"><span className="min-w-0"><span className="block truncate text-sm">{lesson.title}</span><span className="mt-1 block text-xs text-text-muted">{lesson.status === "ready" ? "Ready to practice" : lesson.stage}</span></span><span className="text-gold">{lesson.status === "failed" ? "!" : "→"}</span></Link>)}</div></section>}
  </main>;
}
