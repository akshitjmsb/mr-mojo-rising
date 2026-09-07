"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { adjustRangeEdge, type PlaybackRange } from "@/lib/song-player-defaults";

type Props = {
  bounds: PlaybackRange;
  value: PlaybackRange;
  onChange: (range: PlaybackRange) => void;
};

function timeLabel(time: number) {
  const tenths = Math.round(time * 10);
  return `${Math.floor(tenths / 600)}:${(Math.floor(tenths / 10) % 60).toString().padStart(2, "0")}.${tenths % 10}`;
}

export default function SelectionRange({ bounds, value, onChange }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; time: number; width: number } | null>(null);
  const duration = bounds.end - bounds.start;
  const percent = (time: number) => ((time - bounds.start) / duration) * 100;

  function begin(event: PointerEvent<HTMLButtonElement>, edge: "start" | "end") {
    if (!event.isPrimary || event.button !== 0) return;
    const width = track.current?.getBoundingClientRect().width;
    if (!width) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, time: value[edge], width };
  }

  function move(event: PointerEvent<HTMLButtonElement>, edge: "start" | "end") {
    if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const time = drag.current.time + ((event.clientX - drag.current.x) / drag.current.width) * duration;
    onChange(adjustRangeEdge(value, edge, time, bounds));
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, edge: "start" | "end") {
    const step = event.shiftKey ? 1 : 0.1;
    const next = event.key === "Home" ? bounds.start
      : event.key === "End" ? bounds.end
        : event.key === "ArrowLeft" || event.key === "ArrowDown" ? value[edge] - step
          : event.key === "ArrowRight" || event.key === "ArrowUp" ? value[edge] + step
            : null;
    if (next === null) return;
    event.preventDefault();
    onChange(adjustRangeEdge(value, edge, next, bounds));
  }

  return (
    <div className="mt-3" role="group" aria-label="Adjust selection">
      <div className="flex justify-between font-josefin text-[10px] tabular-nums text-gold">
        <span>Start {timeLabel(value.start)}</span>
        <span>End {timeLabel(value.end)}</span>
      </div>
      <div ref={track} className="relative mx-5 h-12">
        <div className="absolute inset-x-0 top-5 h-2 rounded-full bg-border-dark" />
        <div className="absolute top-5 h-2 bg-gold/60" style={{ left: `${percent(value.start)}%`, width: `${percent(value.end) - percent(value.start)}%` }} />
        {(["start", "end"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            role="slider"
            aria-label={`Selection ${edge}`}
            aria-valuemin={edge === "start" ? bounds.start : value.start + Math.min(0.5, duration)}
            aria-valuemax={edge === "end" ? bounds.end : value.end - Math.min(0.5, duration)}
            aria-valuenow={value[edge]}
            aria-valuetext={timeLabel(value[edge])}
            onPointerDown={(event) => begin(event, edge)}
            onPointerMove={(event) => move(event, edge)}
            onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={(event) => keyDown(event, edge)}
            className={`absolute top-0 flex h-12 w-10 touch-none items-center rounded-sm focus-visible:outline-2 focus-visible:outline-gold ${edge === "start" ? "-translate-x-full justify-end" : "justify-start"}`}
            style={{ left: `${percent(value[edge])}%` }}
          >
            <span aria-hidden="true" className="flex h-7 w-4 items-center justify-center rounded-[3px] border border-gold bg-bg text-[10px] text-gold">Ⅱ</span>
          </button>
        ))}
      </div>
      <p className="text-center font-josefin text-[8px] tracking-[0.04em] text-text-muted">Drag the ends to choose your part</p>
    </div>
  );
}
