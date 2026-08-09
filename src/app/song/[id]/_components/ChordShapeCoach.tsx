"use client";

import { useState } from "react";
import {
  getChordShape,
  type ChordShape,
  type Finger,
} from "@/lib/chord-shapes";
import { transposeChord } from "@/lib/guitar";

const STRING_NAMES = ["low E", "A", "D", "G", "B", "high E"] as const;
const FINGER_NAMES: Record<Finger, string> = {
  1: "index",
  2: "middle",
  3: "ring",
  4: "little",
};

function ChordDiagram({
  chord,
  shape,
  compact = false,
}: {
  chord: string;
  shape: ChordShape;
  compact?: boolean;
}) {
  const width = compact ? 82 : 184;
  const height = compact ? 92 : 190;
  const left = compact ? 15 : 30;
  const right = compact ? 9 : 20;
  const top = compact ? 18 : 31;
  const bottom = compact ? 7 : 18;
  const stringGap = (width - left - right) / 5;
  const fretGap = (height - top - bottom) / 5;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${chord} chord diagram`}
      className={compact ? "h-[78px] w-full" : "mx-auto h-[190px] w-[184px]"}
    >
      {shape.frets.map((fret, stringIndex) => {
        const x = left + stringIndex * stringGap;
        const marker = fret === null ? "×" : fret === 0 ? "○" : null;
        return marker ? (
          <text
            key={`marker-${STRING_NAMES[stringIndex]}`}
            x={x}
            y={compact ? 11 : 18}
            textAnchor="middle"
            fill="var(--color-text-muted)"
            fontSize={compact ? 9 : 14}
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
            strokeWidth={index === 0 ? (compact ? 2 : 4) : 1}
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
            strokeWidth={compact ? 0.8 : 1.2}
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
            <circle
              cx={x}
              cy={y}
              r={compact ? 5.5 : 11}
              fill="var(--color-gold)"
            />
            {finger ? (
              <text
                x={x}
                y={y + (compact ? 2.5 : 4)}
                textAnchor="middle"
                fill="var(--color-bg)"
                fontSize={compact ? 7 : 11}
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

function placementInstructions(shape: ChordShape) {
  const pressed = shape.frets.flatMap((fret, index) => {
    const finger = shape.fingers[index];
    if (!fret || !finger) return [];
    return [
      {
        finger,
        text: `${FINGER_NAMES[finger]} finger · ${STRING_NAMES[index]} string · fret ${fret}`,
      },
    ];
  });
  return pressed.toSorted((a, b) => a.finger - b.finger);
}

export default function ChordShapeCoach({
  chords,
  tuningName,
  tuningOffset,
}: {
  chords: string[];
  tuningName: string;
  tuningOffset: number;
}) {
  const availableChords = chords.filter((chord) => getChordShape(chord));
  const [selectedChord, setSelectedChord] = useState(availableChords[0] ?? "");
  const activeChord = availableChords.includes(selectedChord)
    ? selectedChord
    : (availableChords[0] ?? "");
  const activeShape = getChordShape(activeChord);

  if (availableChords.length === 0 || !activeShape) {
    return (
      <p className="mt-2 rounded-[2px] border border-border-dark p-3 font-josefin text-[10px] leading-relaxed text-text-muted">
        These shapes need a custom diagram. Use the chord names for now and practise them slowly.
      </p>
    );
  }

  const soundingChord = transposeChord(activeChord, tuningOffset);
  const instructions = placementInstructions(activeShape);

  return (
    <div className="mt-2">
      <div className="grid grid-cols-3 gap-2" aria-label="Chord shapes">
        {availableChords.map((chord) => {
          const shape = getChordShape(chord)!;
          const selected = chord === activeChord;
          return (
            <button
              key={chord}
              type="button"
              onClick={() => setSelectedChord(chord)}
              aria-pressed={selected}
              className={`min-w-0 cursor-pointer rounded-[2px] border px-1 pb-1 pt-2 transition-colors ${
                selected
                  ? "border-gold bg-gold/[0.08]"
                  : "border-border-dark bg-bg/50"
              }`}
            >
              <span className="font-playfair text-[17px] italic text-gold">
                {chord}
              </span>
              <ChordDiagram chord={chord} shape={shape} compact />
              <span className="block font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark">
                Tap to learn
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-[2px] border border-gold/35 bg-bg/60 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-josefin text-[8px] uppercase tracking-[0.16em] text-text-dark">
              Chord coach
            </p>
            <p className="mt-1 font-playfair text-[24px] italic text-gold">
              {activeChord} shape
            </p>
          </div>
          <p className="pt-1 text-right font-josefin text-[8px] leading-relaxed text-text-muted">
            Shape {activeChord}
            <br />Sounds {soundingChord}
          </p>
        </div>

        <ChordDiagram chord={activeChord} shape={activeShape} />

        <ol className="space-y-1.5">
          {instructions.map(({ finger, text }) => (
            <li
              key={finger}
              className="flex items-center gap-2 font-josefin text-[10px] text-text"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold font-josefin text-[9px] font-bold text-bg">
                {finger}
              </span>
              {text}
            </li>
          ))}
        </ol>

        <p className="mt-3 font-josefin text-[9px] leading-relaxed text-text-muted">
          ○ open · × do not play · {activeShape.tip}
        </p>
        <p className="mt-2 border-t border-border-dark pt-2 font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
          Guitar: {tuningName} · familiar {activeChord} fingering · concert pitch {soundingChord}
        </p>
      </div>
    </div>
  );
}
