"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Database } from "@/lib/database.types";
import { formatTime, getSectionColor } from "./sections";

type Section = Database["public"]["Tables"]["sections"]["Row"];

interface Props {
  activeSection: Section | null;
  currentTime: number;
  duration: number;
  seekTo: (time: number) => void;
}

export default function Scrubber({
  activeSection,
  currentTime,
  duration,
  seekTo,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);

  const sectionProgress =
    activeSection && activeSection.end_time > activeSection.start_time
      ? Math.max(
          0,
          Math.min(
            1,
            (currentTime - activeSection.start_time) /
              (activeSection.end_time - activeSection.start_time),
          ),
        )
      : 0;

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!activeSection || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const next =
        activeSection.start_time +
        ratio * (activeSection.end_time - activeSection.start_time);
      seekTo(next);
    },
    [activeSection, seekTo],
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    scrubbingRef.current = true;
    seekFromClientX(e.clientX);
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!scrubbingRef.current) return;
      seekFromClientX(e.clientX);
    }
    function up() {
      scrubbingRef.current = false;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [seekFromClientX]);

  const overall = duration > 0 ? currentTime / duration : 0;

  return (
    <>
      <div className="px-5">
        <div className="relative h-0.5 rounded-[1px] bg-border-darkest">
          <div
            className="absolute inset-y-0 left-0 rounded-[1px] bg-gold/45 transition-[width] duration-100 ease-linear"
            style={{ width: `${overall * 100}%` }}
          />
        </div>
      </div>

      {activeSection && (
        <>
          <div className="flex items-center gap-2.5 px-5 pt-1 pb-2.5">
            <span className="min-w-[32px] font-josefin text-[10px] font-light tracking-[0.06em] text-text-dark">
              {formatTime(currentTime)}
            </span>

            <div
              ref={trackRef}
              onPointerDown={onPointerDown}
              className="relative h-1 flex-1 cursor-ew-resize touch-none"
            >
              <div className="absolute inset-0 rounded-[2px] bg-border-dark" />
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-100 ease-linear"
                style={{
                  width: `${sectionProgress * 100}%`,
                  background: getSectionColor(activeSection.label),
                }}
              />
              <div
                className="absolute top-1/2 h-[5px] w-[5px] -translate-y-1/2 -translate-x-1/2 rotate-45 bg-gold"
                style={{ left: `${sectionProgress * 100}%` }}
              />
            </div>

            <span className="min-w-[32px] text-right font-josefin text-[10px] font-light tracking-[0.06em] text-text-dark">
              {formatTime(activeSection.end_time)}
            </span>
          </div>

          <div className="flex items-baseline justify-between px-5 pb-1.5">
            <span className="font-playfair text-[13px] italic text-text-secondary">
              {activeSection.label}
            </span>
            <span className="font-josefin text-[10px] font-thin tracking-[0.1em] text-text-dark">
              {formatTime(activeSection.start_time)} &mdash;{" "}
              {formatTime(activeSection.end_time)}
            </span>
          </div>
        </>
      )}
    </>
  );
}
