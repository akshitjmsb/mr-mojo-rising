"use client";
import { useMemo, useState } from "react";
import type { Chord, Lyrics, PracticeProfile, Section, StemLayer, TabNote } from "@/lib/database.types";
import { getSongPracticeTuning } from "@/lib/guitar";
import { fullSongRange, skipWithinRange } from "@/lib/song-player-defaults";
import SyncedLyrics from "./SyncedLyrics";
import SelectionRange from "./SelectionRange";
import SelectionDownloadButton from "./SelectionDownloadButton";
type AudioSource = "guitar" | "lead" | "rhythm" | "vocals" | "full" | "rhythm_vocals";
type TimeRange = { start: number; end: number };
interface Props {
  songId: string; songTitle: string; stemLayers: StemLayer[];
  sections: Section[]; chords: Chord[]; lyrics: Lyrics | null;
  tabNotes: TabNote[]; profile: PracticeProfile;
  currentTime: number; isPlaying: boolean; currentAudioSource: AudioSource;
  loopStart: number; loopEnd: number;
  onPractice: (range: TimeRange, speed: number, source?: AudioSource) => void;
  onReplay: (range: TimeRange, speed: number, source?: AudioSource) => void;
  onSeek: (time: number) => void; onRangeChange: (range: TimeRange) => void;
}
const ALL = "__all__";
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
export default function SongMap({ songId, songTitle, stemLayers, sections, chords, lyrics, profile,
  currentTime, isPlaying, currentAudioSource, loopStart, loopEnd, onPractice, onReplay, onSeek, onRangeChange }: Props) {
  const pieces = useMemo(() => {
    const vocals = stemLayers.find(layer => layer.instrument === "vocals" && layer.url);
    const blend = stemLayers.find(layer => layer.layer_key === "vocals_rhythm" && layer.url);
    return [
      ...(vocals ? [{ label: "Vocals", source: "vocals" as const, key: vocals.layer_key }] : []),
      ...(blend ? [{ label: "Guitar + Vocals", source: "rhythm_vocals" as const, key: blend.layer_key }] : []),
    ];
  }, [stemLayers]);
  const [source, setSource] = useState<"vocals" | "rhythm_vocals">("vocals");
  const [sectionId, setSectionId] = useState(ALL);
  const [custom, setCustom] = useState<TimeRange | null>(null);
  const [trim, setTrim] = useState(false);
  const fullRange = useMemo(() => fullSongRange(sections), [sections]);
  const section = sections.find(item => item.id === sectionId);
  const range = custom ?? (section ? { start: section.start_time, end: section.end_time } : fullRange);
  const piece = pieces.find(item => item.source === source) ?? pieces[0];
  const tuning = getSongPracticeTuning(songId, profile.tuning_id);
  if (!range || !piece) return <p className="p-4 text-sm text-text-muted">Your listening tracks are not ready yet.</p>;
  const selected = currentAudioSource === piece.source && Math.abs(loopStart - range.start) < .05 && Math.abs(loopEnd - range.end) < .05;
  const playing = selected && isPlaying;
  const position = selected ? Math.max(range.start, Math.min(range.end, currentTime)) : range.start;
  const label = custom ? "Custom selection" : section?.label ?? "Entire song";
  return (
    <section aria-label="Song player" className="song-player flex min-h-0 flex-1 flex-col gap-2 px-4 py-2">
      <div className="grid shrink-0 grid-cols-2 gap-1 rounded border border-border-dark p-1" aria-label="Audio tracks">
        {pieces.map(item => <button key={item.key} type="button" aria-pressed={piece.key === item.key}
          onClick={() => { setSource(item.source); onReplay(range, 1, item.source); }}
          className={`min-h-11 rounded px-2 font-josefin text-[12px] ${piece.key === item.key ? "bg-gold/10 text-gold" : "text-text-muted"}`}>{item.label}</button>)}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select aria-label="Song section" value={custom ? "__custom__" : sectionId}
          onChange={event => { const id = event.target.value; const part = sections.find(s => s.id === id);
            const next = part ? { start: part.start_time, end: part.end_time } : fullRange;
            if (next) { setSectionId(id); setCustom(null); onReplay(next, 1, piece.source); } }}
          className="min-h-11 min-w-0 flex-1 rounded border border-border-dark bg-bg px-2 font-josefin text-[12px] text-text">
          <option value={ALL}>Entire song · {time(fullRange?.end ?? range.end)}</option>
          {custom ? <option value="__custom__">Custom · {time(range.start)}–{time(range.end)}</option> : null}
          {sections.map(item => <option key={item.id} value={item.id}>{item.label} · {time(item.start_time)}–{time(item.end_time)}</option>)}
        </select>
        <button type="button" aria-expanded={trim} aria-controls="selection-trim" onClick={() => setTrim(!trim)} className="min-h-11 px-3 font-josefin text-[12px] text-gold">{trim ? "Done" : "Trim"}</button>
      </div>
      {trim && fullRange ? <div id="selection-trim" className="shrink-0"><SelectionRange bounds={fullRange} value={range} onChange={next => { setCustom(next); onRangeChange(next); }} /></div> : null}
      <div className="shrink-0">
        <div className="grid grid-cols-[44px_1fr_44px_44px] gap-2">
          <button type="button" aria-label="Rewind 10 seconds" onClick={() => onSeek(skipWithinRange(position, -10, range))} className="min-h-11 text-[12px] text-text-muted">−10</button>
          <button type="button" aria-label={playing ? "Pause" : "Play selection"} aria-pressed={playing} onClick={() => selected ? onPractice(range, 1, piece.source) : onReplay(range, 1, piece.source)} className="min-h-11 rounded border border-gold bg-gold/10 font-josefin text-[13px] text-gold">{playing ? "Pause" : "Play"}</button>
          <button type="button" aria-label="Forward 10 seconds" onClick={() => onSeek(skipWithinRange(position, 10, range))} className="min-h-11 text-[12px] text-text-muted">+10</button>
          <SelectionDownloadButton compact key={`${piece.key}:${range.start}:${range.end}`} songId={songId} songTitle={songTitle} layerKey={piece.key} pieceLabel={piece.label} sectionLabel={label} start={range.start} end={range.end} />
        </div>
        <input aria-label={`Seek within ${label}`} type="range" min={range.start} max={range.end} step="0.1" value={position} onChange={event => onSeek(Number(event.target.value))} className="h-8 w-full accent-gold" />
        <div className="flex justify-between font-josefin text-[10px] tabular-nums text-text-muted"><span>{time(position)} / {time(range.end)}</span><span>{tuning.name} · Original tempo</span></div>
      </div>
      <SyncedLyrics compact lyrics={lyrics} chords={chords} chordShapeShift={profile.chord_shape_shift} currentTime={currentTime} range={range} onSeek={onSeek} />
    </section>
  );
}
