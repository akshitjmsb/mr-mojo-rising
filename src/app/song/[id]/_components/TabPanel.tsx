"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TabNote } from "@/lib/database.types";

interface Props {
  notes: TabNote[];
  currentTime: number;
  seekTo: (time: number) => void;
}

// Horizontal px per second of song time — the zoom level of the tab lane.
const PX_PER_SEC = 80;
const LANE_HEIGHT = 22;
const PAD_TOP = 8;
// The playhead sits at 30% so most of the visible lane is upcoming notes.
const PLAYHEAD_FRAC = 0.3;
const WINDOW_BEHIND_S = 10;
const WINDOW_AHEAD_S = 20;

// Display order top→bottom follows tab convention: high e on top.
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

/**
 * Time-synced scrolling tablature. Notes ride a translated lane under a fixed
 * playhead; the active note lights up gold. Tap anywhere on the lane to seek.
 */
export default function TabPanel({ notes, currentTime, seekTo }: Props) {
  const [open, setOpen] = useState(true);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(380);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setBoxWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // Only materialise notes near the playhead — songs can have thousands.
  const visible = useMemo(() => {
    const from = currentTime - WINDOW_BEHIND_S;
    const to = currentTime + WINDOW_AHEAD_S;
    return notes.filter((n) => n.start_time >= from && n.start_time <= to);
  }, [notes, currentTime]);

  if (notes.length === 0) return null;

  const playheadX = boxWidth * PLAYHEAD_FRAC;
  const laneOffset = playheadX - currentTime * PX_PER_SEC;
  const height = PAD_TOP * 2 + LANE_HEIGHT * 6;

  function handleSeek(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = currentTime + (x - playheadX) / PX_PER_SEC;
    if (Number.isFinite(time)) seekTo(Math.max(0, time));
  }

  return (
    <div className="px-5 pb-3.5">
      <div className={open ? "mb-3" : ""}>
        <button
          onClick={() => setOpen((v) => !v)}
          className={`cursor-pointer rounded-[1px] border px-3.5 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.18em] transition-colors duration-300 ${
            open
              ? "border-gold bg-gold/5 text-gold"
              : "border-border bg-transparent text-text-dark"
          }`}
        >
          Guitar Tab
        </button>
      </div>

      {open && (
        <div
          ref={boxRef}
          onPointerDown={handleSeek}
          className="relative touch-none select-none overflow-hidden rounded-[2px] border border-border-dark"
          style={{ height }}
        >
          {/* String lines + labels (fixed) */}
          {STRING_LABELS.map((label, i) => {
            const y = PAD_TOP + i * LANE_HEIGHT + LANE_HEIGHT / 2;
            return (
              <div key={label}>
                <div
                  className="absolute left-0 right-0 border-t border-border-darkest"
                  style={{ top: y }}
                />
                <span
                  className="absolute left-1.5 z-10 bg-bg pr-1 font-josefin text-[9px] leading-none text-text-dark"
                  style={{ top: y - 4 }}
                >
                  {label}
                </span>
              </div>
            );
          })}

          {/* Notes lane — translated so `currentTime` sits under the playhead */}
          <div
            className="absolute inset-0 will-change-transform"
            style={{ transform: `translateX(${laneOffset}px)` }}
          >
            {visible.map((n) => {
              const active =
                currentTime >= n.start_time &&
                currentTime <= n.start_time + n.duration;
              const past = currentTime > n.start_time + n.duration;
              const y =
                PAD_TOP + (n.string_num - 1) * LANE_HEIGHT + LANE_HEIGHT / 2;
              const sustainWidth = Math.max(
                0,
                n.duration * PX_PER_SEC - 10,
              );
              return (
                <div
                  key={n.id}
                  className="absolute"
                  style={{ left: n.start_time * PX_PER_SEC, top: 0 }}
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
                    {n.fret}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-gold/60"
            style={{ left: playheadX }}
          />
        </div>
      )}
    </div>
  );
}
