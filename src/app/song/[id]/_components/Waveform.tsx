import { useMemo } from "react";
import type { Section } from "@/lib/database.types";
import { getSectionColor } from "./sections";

interface Props {
  sections: Section[];
  currentTime: number;
  duration: number;
}

export default function Waveform({ sections, currentTime, duration }: Props) {
  // Pseudo-random but stable bar heights — deterministic so SSR matches client.
  const bars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => {
        const wave = Math.sin(i * 0.18) * 0.3 + Math.sin(i * 0.07) * 0.2;
        return Math.min(
          1,
          0.12 + Math.abs(wave) + (Math.sin(i * 3.7) * 0.5 + 0.5) * 0.38,
        );
      }),
    [],
  );

  const overallProgress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="px-5 pt-4 pb-2">
      <div className="flex h-[60px] items-center gap-[1.5px]">
        {bars.map((h, i) => {
          const barProgress = i / bars.length;
          const barTime = barProgress * duration;
          const barSection = sections.find(
            (s) => barTime >= s.start_time && barTime < s.end_time,
          );

          let color = "var(--color-inactive)";
          if (barSection) {
            color =
              barProgress <= overallProgress
                ? getSectionColor(barSection.label)
                : `${getSectionColor(barSection.label)}33`;
          }

          return (
            <div
              key={i}
              className="flex-1 rounded-[0.5px] transition-colors duration-150"
              style={{ height: `${h * 100}%`, background: color }}
            />
          );
        })}
      </div>
    </div>
  );
}
