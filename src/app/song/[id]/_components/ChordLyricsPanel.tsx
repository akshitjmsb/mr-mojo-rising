"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Chord, Lyrics } from "@/lib/database.types";
import { findCurrentLineIndex, parseLrc } from "@/lib/lrc-parser";

interface Props {
  chords: Chord[];
  lyrics: Lyrics | null;
  currentTime: number;
}

export default function ChordLyricsPanel({ chords, lyrics, currentTime }: Props) {
  const [open, setOpen] = useState(true);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const hasChords = chords.length > 0;
  const hasLyrics = lyrics !== null;

  const lrcLines = useMemo(
    () => (lyrics?.synced_lrc ? parseLrc(lyrics.synced_lrc) : []),
    [lyrics],
  );

  const adjustedLines = useMemo(
    () => lrcLines.map((line) => ({ ...line, time: line.time + offset })),
    [lrcLines, offset],
  );

  const currentIndex = useMemo(
    () => findCurrentLineIndex(adjustedLines, currentTime),
    [adjustedLines, currentTime],
  );

  // Map each lyric line index → unique chord labels that start during that line.
  const chordsForLine = useMemo(() => {
    if (adjustedLines.length === 0 || chords.length === 0)
      return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    for (let i = 0; i < adjustedLines.length; i++) {
      const lineStart = adjustedLines[i].time;
      const lineEnd =
        i + 1 < adjustedLines.length ? adjustedLines[i + 1].time : Infinity;
      const lineChords: string[] = [];
      let prev = "";
      for (const c of chords) {
        if (c.start_time >= lineEnd) break;
        if (c.start_time >= lineStart && c.chord_label !== prev) {
          lineChords.push(c.chord_label);
          prev = c.chord_label;
        }
      }
      if (lineChords.length > 0) map.set(i, lineChords);
    }
    return map;
  }, [adjustedLines, chords]);

  useEffect(() => {
    if (currentIndex < 0 || !containerRef.current) return;
    const container = containerRef.current;
    const el = container.querySelector(
      `[data-lyric-index="${currentIndex}"]`,
    ) as HTMLElement | null;
    if (el) {
      const top = el.offsetTop - container.offsetTop - 50;
      container.scrollTop = Math.max(0, top);
    }
  }, [currentIndex]);

  if (!hasChords && !hasLyrics) return null;

  return (
    <div className="px-5 pb-3.5">
      <div
        className={`flex items-center gap-2 ${open ? "mb-3" : ""}`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className={`cursor-pointer rounded-[1px] border px-3.5 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.18em] transition-colors duration-300 ${
            open
              ? "border-gold bg-gold/5 text-gold"
              : "border-border bg-transparent text-text-dark"
          }`}
        >
          Chords &amp; Lyrics
        </button>

        {open && lrcLines.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset((o) => Math.round((o - 0.5) * 10) / 10)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[1px] border border-border-dark bg-transparent font-josefin text-[13px] text-text-dark"
              aria-label="Lyrics earlier"
            >
              &minus;
            </button>
            <span
              className={`min-w-[64px] cursor-pointer text-center font-josefin text-[9px] font-light tracking-[0.06em] ${
                offset === 0 ? "text-text-muted" : "text-gold"
              }`}
              onClick={() => setOffset(0)}
              title={offset === 0 ? undefined : "Click to reset"}
            >
              {offset === 0
                ? "in sync"
                : offset > 0
                  ? "lyrics early"
                  : "lyrics late"}
            </span>
            <button
              onClick={() => setOffset((o) => Math.round((o + 0.5) * 10) / 10)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[1px] border border-border-dark bg-transparent font-josefin text-[13px] text-text-dark"
              aria-label="Lyrics later"
            >
              +
            </button>
          </div>
        )}
      </div>

      {open && (
        <div
          ref={containerRef}
          className="max-h-[220px] overflow-y-auto rounded-[2px] border border-border-dark px-4 py-3 scroll-smooth"
        >
          {lrcLines.length > 0 ? (
            adjustedLines.map((line, i) => {
              const isCurrent = i === currentIndex;
              const lineChords = chordsForLine.get(i);
              return (
                <div key={i} data-lyric-index={i}>
                  {lineChords && (
                    <p
                      className={`pt-1 font-josefin text-[10px] tracking-[0.08em] leading-[1.3] transition-colors duration-200 ${
                        isCurrent ? "text-gold" : "text-orange"
                      }`}
                    >
                      {lineChords.join("  ")}
                    </p>
                  )}
                  <p
                    className={`px-0 pb-[3px] pt-px font-josefin leading-[1.5] transition-all duration-200 ${
                      isCurrent
                        ? "text-[13px] text-gold"
                        : "text-[11px] font-thin text-text-muted"
                    }`}
                  >
                    {line.text}
                  </p>
                </div>
              );
            })
          ) : lyrics?.plain_text ? (
            <p className="whitespace-pre-wrap font-josefin text-[11px] font-thin leading-[1.7] text-text-secondary">
              {lyrics.plain_text}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
