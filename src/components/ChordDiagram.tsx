"use client";

import { useEffect, useRef, memo } from "react";
import { SVGuitarChord, BarreChordStyle } from "svguitar";
import { getChordVoicing } from "@/lib/chord-voicings";

interface ChordDiagramProps {
  chordName: string;
  width?: number;
}

function ChordDiagramInner({ chordName, width = 140 }: ChordDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevChordRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current) return;

    // Skip redraw if chord hasn't actually changed
    if (prevChordRef.current === chordName) return;
    prevChordRef.current = chordName;

    const voicing = getChordVoicing(chordName);
    if (!voicing) {
      containerRef.current.innerHTML = "";
      return;
    }

    // Double-buffer: draw into a temporary off-screen container, then swap
    const tempContainer = document.createElement("div");
    tempContainer.style.width = `${width}px`;
    tempContainer.style.height = `${width * 1.2}px`;

    const chart = new SVGuitarChord(tempContainer);

    // Deduplicate: barred strings are covered by the barre
    const barredStrings = new Set<string>();
    for (const barre of voicing.barres) {
      for (let s = barre.to; s <= barre.from; s++) {
        barredStrings.add(`${s}-${barre.fret}`);
      }
    }

    const fingers: [number, number | "x"][] = [];
    for (const f of voicing.fingers) {
      const [string, fret] = f;
      if (barredStrings.has(`${string}-${fret}`)) continue;
      fingers.push([string, fret]);
    }

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

    // Swap: replace old content with newly drawn SVG in one operation
    containerRef.current.replaceChildren(...Array.from(tempContainer.childNodes));
  }, [chordName, width]);

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

const ChordDiagram = memo(ChordDiagramInner);
export default ChordDiagram;
