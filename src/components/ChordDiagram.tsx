"use client";

import { useEffect, useRef } from "react";
import { SVGuitarChord, BarreChordStyle } from "svguitar";
import { getChordVoicing } from "@/lib/chord-voicings";

interface ChordDiagramProps {
  chordName: string;
  width?: number;
}

export default function ChordDiagram({ chordName, width = 140 }: ChordDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const voicing = getChordVoicing(chordName);
    if (!voicing) {
      containerRef.current.innerHTML = "";
      return;
    }

    // Clear previous
    containerRef.current.innerHTML = "";

    const chart = new SVGuitarChord(containerRef.current);

    // Map voicing fingers to svguitar format: [string, fret, text?]
    // svguitar uses 1=thickest(low E), 6=thinnest(high E) — same as our format
    // but we need to deduplicate: barred strings are covered by the barre
    const barredStrings = new Set<string>();
    for (const barre of voicing.barres) {
      for (let s = barre.to; s <= barre.from; s++) {
        barredStrings.add(`${s}-${barre.fret}`);
      }
    }

    const fingers: [number, number | "x"][] = [];
    for (const f of voicing.fingers) {
      const [string, fret] = f;
      // Skip fingers that are part of a barre at the same fret
      if (barredStrings.has(`${string}-${fret}`)) continue;
      fingers.push([string, fret]);
    }

    // Add muted strings
    for (const s of voicing.muted) {
      fingers.push([s, "x"]);
    }

    chart
      .configure({
        strings: 6,
        frets: 4,
        fingerSize: 0.65,
        fingerColor: "#D4A844",
        fingerTextColor: "#1A1A1A",
        barreChordStyle: BarreChordStyle.RECTANGLE,
        backgroundColor: "transparent",
        color: "#D4A844",
        nutWidth: 4,
        fretColor: "#4A4030",
        stringColor: "#6A5A40",
        strokeWidth: 1,
        titleFontSize: 0,
        fixedDiagramPosition: true,
      })
      .chord({
        fingers,
        barres: voicing.barres.map((b) => ({
          fromString: b.from,
          toString: b.to,
          fret: b.fret,
        })),
        position: voicing.baseFret,
      })
      .draw();
  }, [chordName]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height: width * 1.2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    />
  );
}
