export type Evidence = { kind: "transcript" | "description" | "visual" | "audio"; at: number | null; detail: string };
export type LessonFact = { value: string | null; evidence: Evidence[]; review: string | null };
export type LessonChord = { name: string; frets: (string | null)[]; evidence: Evidence[]; review: string | null };
export type LessonNote = { string: number; fret: number; slot: number; technique: string };
export type LessonPhrase = {
  title: string; start: number | null; end: number | null; notes: LessonNote[];
  evidence: Evidence[]; review: string | null;
};
export type LessonSection = {
  title: string; start: number | null; end: number | null;
  chords: LessonChord[]; strumming: LessonFact; picking: LessonFact;
  phrases: LessonPhrase[]; tips: LessonFact[];
};
export type LessonPack = {
  version: 1;
  source: { url: string | null; title: string; channel: string | null; duration: number | null; captions: string };
  metadata: { song: LessonFact; artist: LessonFact; tuning: LessonFact; capo: LessonFact; key: LessonFact; level: LessonFact; gear: LessonFact };
  sections: LessonSection[]; songMap: LessonFact;
  resources: { title: string; url: string; evidence: string }[];
  notices: string[];
};
export type LessonRow = {
  id: string; source_url: string | null; title: string; status: "queued" | "running" | "ready" | "failed";
  stage: string; error: string | null; created_at: number; updated_at: number; heartbeat_at?: number | null; pack?: LessonPack | null;
};

export function lessonTime(seconds: number | null): string {
  if (seconds === null) return "Time not stated";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

/** Source cues are navigation windows, never inferred musical performance bounds. */
export function lessonPlayback(source: LessonPack["source"], section: LessonSection, phrase?: LessonPhrase) {
  if (phrase?.start !== null && phrase?.start !== undefined && phrase.end !== null) {
    return { start: phrase.start, end: phrase.end, kind: "phrase" as const };
  }
  if (source.url && phrase) {
    const evidence = phrase.evidence.filter(e => (e.kind === "transcript" || e.kind === "visual") && e.at !== null && e.at >= (section.start ?? 0) && e.at < (section.end ?? source.duration ?? Infinity));
    const spoken = evidence.filter(e => e.kind === "transcript");
    const at = (spoken.length ? spoken : evidence).map(e => e.at!).sort((a, b) => a - b)[0];
    if (at !== undefined) {
      const start = Math.max(section.start ?? 0, at - 2);
      return { start, end: Math.min(start + 24, section.end ?? Infinity, source.duration ?? Infinity), kind: "cue" as const };
    }
  }
  return { start: section.start, end: section.end, kind: "section" as const };
}

/** Slots show note order only; they deliberately do not imply measured rhythm. */
export function lessonTab(notes: LessonNote[]): string {
  const slots = [...new Set(notes.map(n => n.slot))].sort((a, b) => a - b);
  const widths = slots.map(slot => Math.max(3, ...notes.filter(n => n.slot === slot).map(n => String(n.fret).length + n.technique.length + 2)));
  return ["e", "B", "G", "D", "A", "E"].map((label, i) => `${label}|` + slots.map((slot, j) => {
    const note = notes.find(n => n.slot === slot && n.string === i + 1);
    return (note ? `${note.fret}${note.technique}` : "").padStart(note ? widths[j] - 1 : widths[j], "-") + (note ? "-" : "");
  }).join("") + "|").join("\n");
}
