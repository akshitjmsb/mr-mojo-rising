"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useState } from "react";
import { lessonTab, lessonTime, type Evidence, type LessonFact, type LessonPack } from "@/lib/lesson-types";
const TeacherPlayer = dynamic(() => import("./TeacherPlayer"), { ssr: false });
const SourceContext = createContext<string | null>(null);

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const source = useContext(SourceContext);
  return <ul className="space-y-2">{evidence.map((entry, index) => <li key={index} className="text-xs leading-relaxed text-text-muted"><span className="text-gold">{entry.kind}{entry.at !== null && (source ? <a href={`${source}&t=${Math.floor(entry.at)}s`} target="_blank" rel="noreferrer" className="inline-block min-h-8 px-2 underline">{lessonTime(entry.at)} ↗</a> : ` · ${lessonTime(entry.at)}`)}</span><p>{entry.detail}</p></li>)}</ul>;
}
function Fact({ label, fact }: { label: string; fact: LessonFact }) {
  return <div className="border-b border-border-darkest py-3"><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-sm">{fact.value ?? "Not stated"}{fact.review ? " [VERIFY]" : ""}</p>{fact.review && <p className="mt-1 text-xs text-terracotta">{fact.review}</p>}<EvidenceList evidence={fact.evidence} /></div>;
}

export default function LessonPractice({ pack }: { pack: LessonPack }) {
  const [sectionIndex, setSectionIndex] = useState(() => Math.max(0, pack.sections.findIndex(section => section.phrases.some(phrase => phrase.notes.length))));
  const [phraseIndex, setPhraseIndex] = useState(0);
  const section = pack.sections[sectionIndex];
  const phrase = section?.phrases[phraseIndex];
  const metadata = pack.metadata;
  if (!section) return <p>No teaching sections could be established.</p>;
  const strum = section.strumming.value;
  const isStrum = strum && /^[DU\s|\-x&1-9]+$/i.test(strum);
  const start = phrase?.start ?? section.start;
  // An unknown phrase interval must not silently become a section loop.
  const end = phrase ? phrase.end : section.end;

  function exportPack() {
    const lines = [`${metadata.song.value || pack.source.title}, ${metadata.artist.value || "Artist not stated"} | ${metadata.tuning.value || "Tuning not stated"} | capo ${metadata.capo.value || "not stated"} | ${metadata.level.value || "Level not stated"}`];
    lines.push(`Teacher: ${pack.source.channel || "Not stated"} | Length: ${lessonTime(pack.source.duration)}`, `Key: ${metadata.key.value || "Not stated"}`);
    if (metadata.gear.value) lines.push(`Tone / gear: ${metadata.gear.value}`);
    for (const [label, fact] of Object.entries(metadata)) if (fact.review) lines.push(`[VERIFY] ${label}: ${fact.review}`);
    for (const s of pack.sections) {
      lines.push(`\n${lessonTime(s.start)} ${s.title}`, s.chords.map(c => c.name + (c.review ? " [VERIFY]" : "")).join(" → "));
      for (const c of s.chords) lines.push(c.name, ...["e", "B", "G", "D", "A", "E"].map((label, i) => `${label}|--${c.frets[i] ?? "?"}--|`), c.review ? `[VERIFY] ${c.review}` : "");
      for (const f of [s.strumming, s.picking, ...s.tips]) if (f.value || f.review) lines.push(`${f.value || ""}${f.review ? ` [VERIFY] ${f.review}` : ""}`);
      for (const p of s.phrases) lines.push(p.title, p.notes.length ? lessonTab(p.notes) : "[VERIFY] Tab not established", p.review ? `[VERIFY] ${p.review}` : "");
    }
    lines.push("\nSong map", pack.songMap.value || "[VERIFY] Arrangement not stated", ...(pack.songMap.review ? [`[VERIFY] ${pack.songMap.review}`] : []), ...pack.resources.map(r => `${r.title}: ${r.url}`), ...pack.notices, `\nSource: ${pack.source.url || "Pasted transcript"}`, pack.source.captions);
    const blobUrl = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = blobUrl; anchor.download = "mojo-lesson.txt"; anchor.click(); setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }

  return <SourceContext value={pack.source.url}>
    <header><p className="text-[10px] uppercase tracking-[.2em] text-gold">Your lesson · {pack.source.channel || "Teacher not stated"}</p><h1 className="mt-2 font-playfair text-3xl">{metadata.song.value || pack.source.title}{metadata.song.review && <span className="text-xs text-terracotta"> [VERIFY]</span>}</h1><p className="mt-1 text-sm text-text-muted">{metadata.artist.value || "Artist not stated"}{metadata.artist.review && " [VERIFY]"}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">{[[metadata.tuning.value || "Tuning not stated", metadata.tuning.review], [`Capo: ${metadata.capo.value || "not stated"}`, metadata.capo.review], [metadata.level.value || "Level not stated", metadata.level.review]].map(([value, review], i) => <span key={i} className="rounded-full border border-border-dark px-3 py-2">{value}{review && " [VERIFY]"}</span>)}</div></header>
    <nav aria-label="Lesson sections" className="-mx-5 mt-7 flex gap-2 overflow-x-auto px-5 pb-2">{pack.sections.map((s, index) => <button key={index} aria-pressed={index === sectionIndex} onClick={() => { setSectionIndex(index); setPhraseIndex(0); }} className={`min-h-12 shrink-0 rounded-xl border px-4 text-left text-xs ${index === sectionIndex ? "border-gold bg-input-bg text-gold" : "border-border-darkest text-text-muted"}`}><span className="block">{s.title}</span><span className="mt-1 block text-[10px] opacity-70">{lessonTime(s.start)}</span></button>)}</nav>
    <section className="mt-5 rounded-2xl border border-border-dark bg-input-bg p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-text-muted">{section.title}</p><h2 className="mt-1 font-playfair text-2xl">{phrase?.title || "The shapes"}</h2></div>{section.phrases.length > 0 && <span className="shrink-0 text-xs text-gold">{phraseIndex + 1} / {section.phrases.length}</span>}</div>
      {phrase && <>{phrase.review && <p className="mt-3 text-xs text-terracotta">[VERIFY] {phrase.review}</p>}{phrase.notes.length > 0 ? <div className="mt-5 overflow-x-auto pb-3" tabIndex={0} aria-label="Guitar tablature, high e string at the top"><pre className="w-max min-w-full font-mono text-lg leading-9 tracking-wide text-gold">{lessonTab(phrase.notes)}</pre></div> : <p className="my-5 text-sm text-text-muted">Tab needs a closer look. Check the teacher’s demonstration.</p>}<p className="mt-1 text-[10px] text-text-muted">Note order · spacing is not rhythm</p></>}
      {section.chords.length > 0 && <div className="mt-5 flex gap-3 overflow-x-auto pb-2">{section.chords.map((chord, i) => <div key={i} className="min-w-20 shrink-0 rounded-lg border border-border-dark p-3"><p className="font-playfair text-lg text-gold">{chord.name}</p><pre className="mt-2 font-mono text-xs leading-5 text-text-secondary">{["e", "B", "G", "D", "A", "E"].map((label, string) => `${label} ─${chord.frets[string] ?? "?"}─`).join("\n")}</pre>{chord.review && <span className="text-[9px] text-terracotta">VERIFY</span>}</div>)}</div>}
      {strum && <div className="mt-4 border-t border-border-dark pt-4"><p className="text-[10px] uppercase tracking-widest text-text-muted">Strum {section.strumming.review && "· VERIFY"}</p><p aria-label={strum} className={isStrum ? "mt-2 text-3xl tracking-widest text-gold" : "mt-2 text-sm text-text-secondary"}>{isStrum ? strum.replace(/D/gi, "↓").replace(/U/gi, "↑") : strum}</p></div>}
      {section.picking.value && <p className="mt-3 text-sm text-gold">{section.picking.value}{section.picking.review && " [VERIFY]"}</p>}
      {section.phrases.length > 1 && <div className="mt-5 flex justify-between border-t border-border-dark pt-3"><button disabled={phraseIndex === 0} onClick={() => setPhraseIndex(i => i - 1)} className="min-h-11 px-2 text-sm text-text-muted disabled:opacity-25">← Previous</button><button disabled={phraseIndex === section.phrases.length - 1} onClick={() => setPhraseIndex(i => i + 1)} className="min-h-11 px-2 text-sm text-gold disabled:opacity-25">Next phrase →</button></div>}
    </section>
    {pack.source.url ? <TeacherPlayer url={pack.source.url} start={start} end={end} /> : <p className="mt-4 text-xs text-text-muted">Pasted transcript · no source audio</p>}
    <details className="mt-5 border-y border-border-darkest py-4"><summary className="cursor-pointer text-sm text-gold">Teacher’s tips & evidence</summary><div className="mt-4 space-y-4">{phrase && <EvidenceList evidence={phrase.evidence} />}{section.chords.map((c, i) => <div key={i}><p className="mb-2 text-sm">{c.name}{c.review ? ` · [VERIFY] ${c.review}` : ""}</p><EvidenceList evidence={c.evidence} /></div>)}<Fact label="Strumming" fact={section.strumming} /><Fact label="Fingerpicking" fact={section.picking} />{section.tips.map((tip, i) => <Fact key={i} label="Teacher’s tip" fact={tip} />)}</div></details>
    <details className="border-b border-border-darkest py-4"><summary className="cursor-pointer text-sm text-gold">Song map & lesson details</summary><Fact label="Song arrangement" fact={pack.songMap} />{Object.entries(metadata).map(([label, fact]) => <Fact key={label} label={label} fact={fact} />)}<p className="mt-3 text-xs text-text-muted">Length: {lessonTime(pack.source.duration)} · Teaching timestamps above refer to the lesson video.</p></details>
    {pack.resources.length > 0 && <details className="border-b border-border-darkest py-4"><summary className="cursor-pointer text-sm text-gold">Free resources · {pack.resources.length}</summary>{pack.resources.map(resource => <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer" className="mt-3 block py-2 text-sm underline">{resource.title} ↗</a>)}<p className="mt-2 text-xs text-text-muted">Advertised free in the description; access may require email signup.</p></details>}
    <button onClick={exportPack} className="mt-5 min-h-11 w-full rounded-xl border border-border-dark text-sm text-text-muted">↓ Save lesson pack</button>
    <details className="mt-5 text-xs leading-relaxed text-text-muted"><summary className="cursor-pointer py-2">Source & reliability</summary><div className="space-y-2">{pack.notices.map((notice, i) => <p key={i}>{notice}</p>)}{pack.source.url && <a className="block underline" href={pack.source.url} target="_blank" rel="noreferrer">Original lesson ↗</a>}<p>{pack.source.captions}</p></div></details>
  </SourceContext>;
}
