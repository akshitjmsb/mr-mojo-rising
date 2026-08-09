"use client";

import { useState } from "react";
import {
  chordMidiNotes,
  getChordShape,
  type ChordShape,
} from "@/lib/chord-shapes";
import { playReferenceChord } from "@/lib/reference-audio";

const STRING_NAMES = ["low E", "A", "D", "G", "B", "high E"] as const;

function ChordDiagram({ chord, shape }: { chord: string; shape: ChordShape }) {
  const width = 104;
  const height = 122;
  const left = 16;
  const right = 10;
  const top = 21;
  const bottom = 8;
  const stringGap = (width - left - right) / 5;
  const fretGap = (height - top - bottom) / 5;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${chord} chord shape`}
      className="mx-auto h-[230px] w-full max-w-[210px]"
    >
      {shape.frets.map((fret, stringIndex) => {
        const x = left + stringIndex * stringGap;
        const marker = fret === null ? "×" : fret === 0 ? "○" : null;
        return marker ? (
          <text
            key={`marker-${STRING_NAMES[stringIndex]}`}
            x={x}
            y={12}
            textAnchor="middle"
            fill="var(--color-text-muted)"
            fontSize={10}
          >
            {marker}
          </text>
        ) : null;
      })}

      {Array.from({ length: 6 }, (_, index) => {
        const y = top + index * fretGap;
        return (
          <line
            key={`fret-${index}`}
            x1={left}
            y1={y}
            x2={width - right}
            y2={y}
            stroke={index === 0 ? "var(--color-gold)" : "var(--color-border-dark)"}
            strokeWidth={index === 0 ? 3 : 1}
          />
        );
      })}

      {shape.frets.map((_, stringIndex) => {
        const x = left + stringIndex * stringGap;
        return (
          <line
            key={`string-${STRING_NAMES[stringIndex]}`}
            x1={x}
            y1={top}
            x2={x}
            y2={height - bottom}
            stroke="var(--color-text-dark)"
            strokeWidth={1}
          />
        );
      })}

      {shape.frets.map((fret, stringIndex) => {
        if (fret === null || fret === 0) return null;
        const x = left + stringIndex * stringGap;
        const y = top + (fret - 0.5) * fretGap;
        const finger = shape.fingers[stringIndex];
        return (
          <g key={`position-${STRING_NAMES[stringIndex]}`}>
            <circle cx={x} cy={y} r={8} fill="var(--color-gold)" />
            {finger ? (
              <text
                x={x}
                y={y + 3.2}
                textAnchor="middle"
                fill="var(--color-bg)"
                fontSize={9}
                fontWeight="700"
              >
                {finger}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export default function ChordShapeCoach({
  chords,
  tuningOffset,
}: {
  chords: string[];
  tuningOffset: number;
}) {
  const shapes = chords.flatMap((chord) => {
    const shape = getChordShape(chord);
    return shape ? [{ chord, shape }] : [];
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeIndex = Math.min(selectedIndex, Math.max(0, shapes.length - 1));
  const active = shapes[activeIndex];

  if (!active) return null;

  function playShape(shape: ChordShape) {
    void playReferenceChord(chordMidiNotes(shape, tuningOffset));
  }

  function selectShape(index: number) {
    setSelectedIndex(index);
    playShape(shapes[index].shape);
  }

  return (
    <div aria-label="Chord shapes">
      <div className="grid grid-cols-6 gap-1.5">
        {shapes.map(({ chord }, index) => (
          <button
            key={chord}
            type="button"
            onClick={() => selectShape(index)}
            aria-pressed={index === activeIndex}
            aria-label={`Show and play ${chord} chord shape`}
            className={`min-h-9 cursor-pointer rounded-[2px] border font-playfair text-[15px] italic ${
              index === activeIndex
                ? "border-gold bg-gold/10 text-gold"
                : "border-border-dark bg-transparent text-text-muted"
            }`}
          >
            {chord}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => playShape(active.shape)}
        aria-label={`Play ${active.chord} chord reference`}
        className="mt-3 w-full cursor-pointer border-x-0 border-y border-border-dark bg-transparent py-3 text-center"
      >
        <span className="font-playfair text-[30px] italic text-gold">
          {active.chord}
          <span aria-hidden="true" className="ml-2 text-[16px] not-italic text-text-dark">
            ♪
          </span>
        </span>
        <ChordDiagram chord={active.chord} shape={active.shape} />
      </button>
    </div>
  );
}
