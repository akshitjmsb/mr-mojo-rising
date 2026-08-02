"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TabNote } from "@/lib/database.types";

interface Props {
  notes: TabNote[];
  currentTime: number;
  duration: number;
  bpm: number | null;
  loopStart: number;
  loopEnd: number;
  seekTo: (time: number) => void;
}

type TabDensity = "clean" | "full";

const LANE_HEIGHT = 22;
const PAD_TOP = 8;
const PLAYHEAD_FRAC = 0.3;
const WINDOW_BEHIND_S = 10;
const WINDOW_AHEAD_S = 20;
const ZOOM_LEVELS = [60, 80, 110] as const;
const DEFAULT_ZOOM_INDEX = 1;
const CLEAN_CONFIDENCE = 0.6;
const TAB_PREFS_KEY = "mr-mojo:tab-view:v1";

// Display order top→bottom follows tab convention: high e on top.
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

function lowerBound(notes: TabNote[], time: number) {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (notes[middle].start_time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Time-synced, beat-aware tablature with a fixed playhead. */
export default function TabPanel({
  notes,
  currentTime,
  duration,
  bpm,
  loopStart,
  loopEnd,
  seekTo,
}: Props) {
  const [open, setOpen] = useState(true);
  const [density, setDensity] = useState<TabDensity>("clean");
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(380);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          density?: TabDensity;
          zoomIndex?: number;
        };
        if (parsed.density === "clean" || parsed.density === "full") {
          setDensity(parsed.density);
        }
        if (
          Number.isInteger(parsed.zoomIndex) &&
          Number(parsed.zoomIndex) >= 0 &&
          Number(parsed.zoomIndex) < ZOOM_LEVELS.length
        ) {
          setZoomIndex(Number(parsed.zoomIndex));
        }
      }
    } catch {
      // Storage can be unavailable in private browsing; defaults still work.
    } finally {
      setPrefsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(
        TAB_PREFS_KEY,
        JSON.stringify({ density, zoomIndex }),
      );
    } catch {
      // Practice remains fully usable when storage is unavailable.
    }
  }, [density, prefsLoaded, zoomIndex]);

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBoxWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  const visible = useMemo(() => {
    const from = currentTime - WINDOW_BEHIND_S;
    const to = currentTime + WINDOW_AHEAD_S;
    const start = lowerBound(notes, from);
    const result: TabNote[] = [];
    for (let index = start; index < notes.length; index++) {
      const note = notes[index];
      if (note.start_time > to) break;
      if (
        density === "full" ||
        note.confidence === null ||
        note.confidence >= CLEAN_CONFIDENCE
      ) {
        result.push(note);
      }
    }
    return result;
  }, [currentTime, density, notes]);

  const beatLines = useMemo(() => {
    if (!bpm || bpm <= 0) return [];
    const beatSeconds = 60 / bpm;
    const from = Math.max(0, currentTime - WINDOW_BEHIND_S);
    const to = currentTime + WINDOW_AHEAD_S;
    const firstBeat = Math.floor(from / beatSeconds);
    const lastBeat = Math.ceil(to / beatSeconds);
    const lines: Array<{ time: number; beat: number; bar: number }> = [];
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      lines.push({
        time: beat * beatSeconds,
        beat: (beat % 4) + 1,
        bar: Math.floor(beat / 4) + 1,
      });
    }
    return lines;
  }, [bpm, currentTime]);

  if (notes.length === 0) return null;

  const pixelsPerSecond = ZOOM_LEVELS[zoomIndex];
  const playheadX = boxWidth * PLAYHEAD_FRAC;
  const laneOffset = playheadX - currentTime * pixelsPerSecond;
  const height = PAD_TOP * 2 + LANE_HEIGHT * 6;

  function handleSeek(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = currentTime + (x - playheadX) / pixelsPerSecond;
    if (Number.isFinite(time)) seekTo(Math.max(0, time));
  }

  function handleKeySeek(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const step = bpm ? 60 / bpm : 0.5;
    seekTo(currentTime + (event.key === "ArrowRight" ? step : -step));
  }

  return (
    <section className="px-5 pb-3.5">
      <div className={`flex items-center justify-between gap-3 ${open ? "mb-3" : ""}`}>
        <button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={`min-h-8 cursor-pointer rounded-[1px] border px-3.5 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.18em] transition-colors duration-300 ${
            open
              ? "border-gold bg-gold/5 text-gold"
              : "border-border bg-transparent text-text-dark"
          }`}
        >
          Guitar Tab
        </button>

        {open && (
          <div className="flex items-center gap-1.5">
            <div className="flex overflow-hidden rounded-[1px] border border-border">
              {(["clean", "full"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setDensity(option)}
                  aria-pressed={density === option}
                  className={`min-h-8 cursor-pointer border-none px-2.5 font-josefin text-[8px] uppercase tracking-[0.1em] ${
                    density === option
                      ? "bg-gold/10 text-gold"
                      : "bg-transparent text-text-dark"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}
              disabled={zoomIndex === 0}
              aria-label="Zoom tab out"
              className="h-8 w-8 cursor-pointer rounded-[1px] border border-border bg-transparent font-josefin text-[14px] text-text-muted disabled:cursor-default disabled:opacity-30"
            >
              −
            </button>
            <button
              onClick={() =>
                setZoomIndex((value) =>
                  Math.min(ZOOM_LEVELS.length - 1, value + 1),
                )
              }
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              aria-label="Zoom tab in"
              className="h-8 w-8 cursor-pointer rounded-[1px] border border-border bg-transparent font-josefin text-[14px] text-text-muted disabled:cursor-default disabled:opacity-30"
            >
              +
            </button>
          </div>
        )}
      </div>

      {open && (
        <>
          <div
            ref={boxRef}
            onPointerDown={handleSeek}
            onKeyDown={handleKeySeek}
            role="slider"
            tabIndex={0}
            aria-label="Seek in guitar tab"
            aria-valuemin={0}
            aria-valuemax={Math.max(duration, loopEnd)}
            aria-valuenow={currentTime}
            className="relative touch-none select-none overflow-hidden rounded-[2px] border border-border-dark"
            style={{ height }}
          >
            {STRING_LABELS.map((label, index) => {
              const y = PAD_TOP + index * LANE_HEIGHT + LANE_HEIGHT / 2;
              return (
                <div key={label}>
                  <div
                    className="absolute left-0 right-0 border-t border-border-darkest"
                    style={{ top: y }}
                  />
                  <span
                    className="absolute left-1.5 z-20 bg-bg pr-1 font-josefin text-[9px] leading-none text-text-dark"
                    style={{ top: y - 4 }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}

            <div
              className="absolute inset-0 will-change-transform"
              style={{ transform: `translateX(${laneOffset}px)` }}
            >
              {beatLines.map((line) => (
                <div
                  key={`${line.bar}-${line.beat}`}
                  className={`absolute bottom-0 top-0 border-l ${
                    line.beat === 1
                      ? "border-gold/25"
                      : "border-border-darkest/60"
                  }`}
                  style={{ left: line.time * pixelsPerSecond }}
                >
                  {line.beat === 1 && (
                    <span className="absolute left-1 top-0.5 font-josefin text-[7px] text-gold/55">
                      {line.bar}
                    </span>
                  )}
                </div>
              ))}

              <div
                className="absolute bottom-0 top-0 border-l border-emerald-500/70"
                style={{ left: loopStart * pixelsPerSecond }}
              />
              <div
                className="absolute bottom-0 top-0 border-l border-terracotta/70"
                style={{ left: loopEnd * pixelsPerSecond }}
              />

              {visible.map((note) => {
                const active =
                  currentTime >= note.start_time &&
                  currentTime <= note.start_time + note.duration;
                const past = currentTime > note.start_time + note.duration;
                const lowConfidence =
                  note.confidence !== null && note.confidence < CLEAN_CONFIDENCE;
                const y =
                  PAD_TOP +
                  (note.string_num - 1) * LANE_HEIGHT +
                  LANE_HEIGHT / 2;
                const sustainWidth = Math.max(
                  0,
                  note.duration * pixelsPerSecond - 10,
                );
                return (
                  <div
                    key={note.id}
                    className={`absolute ${lowConfidence ? "opacity-45" : ""}`}
                    style={{ left: note.start_time * pixelsPerSecond, top: 0 }}
                  >
                    {sustainWidth > 4 && (
                      <div
                        className={`absolute h-px ${
                          active ? "bg-gold/50" : "bg-border-dark"
                        }`}
                        style={{ left: 10, top: y, width: sustainWidth }}
                      />
                    )}
                    <span
                      className={`absolute -translate-x-1/2 bg-bg px-0.5 font-josefin leading-none transition-colors duration-150 ${
                        active
                          ? "text-[13px] font-normal text-gold"
                          : past
                            ? "text-[11px] font-thin text-text-darkest"
                            : "text-[11px] font-thin text-text-darker"
                      }`}
                      style={{ top: y - (active ? 6 : 5) }}
                    >
                      {note.fret}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-gold/70"
              style={{ left: playheadX }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-josefin text-[7px] uppercase tracking-[0.1em] text-text-darkest">
            <span>Green A · Red B</span>
            <span>{bpm ? "Beat grid · estimated 4/4" : "Beat grid unavailable"}</span>
          </div>
        </>
      )}
    </section>
  );
}
