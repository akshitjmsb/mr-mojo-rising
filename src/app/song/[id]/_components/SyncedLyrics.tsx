"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import type { Lyrics } from "@/lib/database.types";
import {
  findCurrentLineIndex,
  parseLrc,
  type LrcLine,
} from "@/lib/lrc-parser";

const MAX_ACTIVE_LINE_SECONDS = 8;

type PlaybackRange = {
  start: number;
  end: number;
};

interface Props {
  lyrics: Lyrics | null;
  currentTime: number;
  range: PlaybackRange;
  onSeek: (time: number) => void;
}

type IndexedLrcLine = LrcLine & { index: number };

const LyricLineList = memo(function LyricLineList({
  lines,
  currentIndex,
  rangeStart,
  onSeek,
}: {
  lines: IndexedLrcLine[];
  currentIndex: number;
  rangeStart: number;
  onSeek: (time: number) => void;
}) {
  return lines.map((line) => {
    const isCurrent = line.index === currentIndex;
    const distance = Math.abs(line.index - currentIndex);
    return (
      <button
        key={`${line.time}-${line.index}`}
        type="button"
        data-lyric-index={line.index}
        aria-current={isCurrent ? "true" : undefined}
        onClick={() => onSeek(Math.max(rangeStart, line.time))}
        className={`block min-h-11 w-full cursor-pointer px-1 py-2 text-left font-josefin leading-relaxed transition-all duration-200 ${
          isCurrent
            ? "text-[15px] font-normal text-gold"
            : distance === 1
              ? "text-[12px] font-light text-text-secondary"
              : "text-[11px] font-light text-text-dark"
        }`}
      >
        {line.text}
      </button>
    );
  });
});

export default function SyncedLyrics({
  lyrics,
  currentTime,
  range,
  onSeek,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const syncedLrc = lyrics?.synced_lrc;
  const lines = useMemo(
    () => (syncedLrc ? parseLrc(syncedLrc) : []),
    [syncedLrc],
  );
  const candidateIndex = findCurrentLineIndex(lines, currentTime);
  const currentIndex =
    candidateIndex >= 0 &&
    currentTime - lines[candidateIndex].time <= MAX_ACTIVE_LINE_SECONDS
      ? candidateIndex
      : -1;
  const visibleLines = useMemo(() => {
    if (lines.length === 0) return [];

    const currentAtRangeStart = findCurrentLineIndex(lines, range.start);
    const hasActiveLineAtRangeStart =
      currentAtRangeStart >= 0 &&
      range.start - lines[currentAtRangeStart].time <= MAX_ACTIVE_LINE_SECONDS;
    const firstLineInRange = lines.findIndex(
      (line) => line.time >= range.start && line.time < range.end,
    );
    const firstIndex =
      hasActiveLineAtRangeStart
        ? currentAtRangeStart
        : firstLineInRange;
    if (firstIndex < 0) return [];

    return lines
      .map((line, index) => ({ ...line, index }))
      .slice(firstIndex)
      .filter((line) => line.time < range.end);
  }, [lines, range.end, range.start]);

  useEffect(() => {
    if (currentIndex < 0 || !containerRef.current) return;
    const container = containerRef.current;
    const activeLine = container.querySelector<HTMLElement>(
      `[data-lyric-index="${currentIndex}"]`,
    );
    if (!activeLine) return;

    const centeredTop =
      activeLine.offsetTop -
      container.offsetTop -
      container.clientHeight / 2 +
      activeLine.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
  }, [currentIndex]);

  if (lines.length === 0) {
    if (!lyrics?.plain_text) {
      return (
        <p className="mt-4 border-t border-border-dark pt-4 text-center font-josefin text-[8px] leading-relaxed tracking-[0.08em] text-text-dark">
          Synced lyrics are not available for this recording yet.
        </p>
      );
    }

    return (
      <div className="mt-4 border-t border-border-dark pt-4">
        <p className="mb-3 font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
          Lyrics · not time-synced
        </p>
        <div className="max-h-64 overflow-y-auto rounded-[2px] border border-border-dark bg-bg/25 px-4 py-3">
          <p className="whitespace-pre-wrap font-josefin text-[11px] font-light leading-[1.8] text-text-secondary">
            {lyrics.plain_text}
          </p>
        </div>
      </div>
    );
  }

  if (visibleLines.length === 0) {
    return (
      <p className="mt-4 border-t border-border-dark pt-4 text-center font-josefin text-[8px] leading-relaxed tracking-[0.08em] text-text-dark">
        No vocals are timestamped inside this part.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-border-dark pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-muted">
          Lyrics
        </p>
        <p className="font-josefin text-[7px] uppercase tracking-[0.1em] text-gold/75">
          Synced · tap a line to jump
        </p>
      </div>
      <div
        ref={containerRef}
        className="max-h-64 overflow-y-auto rounded-[2px] border border-border-dark bg-bg/25 px-4 py-7 scroll-smooth"
        aria-label="Synchronized lyrics"
      >
        <LyricLineList
          lines={visibleLines}
          currentIndex={currentIndex}
          rangeStart={range.start}
          onSeek={onSeek}
        />
      </div>
    </div>
  );
}
