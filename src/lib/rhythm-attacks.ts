import type { TabNote } from "./database.types";

export type RhythmAttack = {
  time: number;
  strength: number;
  noteCount: number;
};

export type RhythmStroke = {
  index: number;
  time: number;
  direction: "down" | "up";
  sounded: boolean;
  strength: number;
};

/** Groups near-simultaneous transcribed notes into audible guitar attacks. */
export function buildRhythmAttacks(
  notes: TabNote[],
  start: number,
  end: number,
  mergeWindow = 0.085,
): RhythmAttack[] {
  const starts = notes
    .filter((note) => note.start_time >= start && note.start_time < end)
    .map((note) => note.start_time)
    .toSorted((a, b) => a - b);
  const groups: Array<{ time: number; count: number }> = [];

  for (const time of starts) {
    const current = groups.at(-1);
    if (current && time - current.time <= mergeWindow) {
      current.count++;
    } else {
      groups.push({ time, count: 1 });
    }
  }

  const largestGroup = Math.max(1, ...groups.map((group) => group.count));
  return groups.map((group) => ({
    time: group.time,
    noteCount: group.count,
    strength: 0.45 + (group.count / largestGroup) * 0.55,
  }));
}

/**
 * Quantizes real attacks onto an eighth-note hand-motion grid. Numbered beats
 * are downstrokes and each "&" is an upstroke; quiet slots still show the
 * motion so the learner's hand never loses time.
 */
export function buildRhythmStrokeGrid(
  attacks: RhythmAttack[],
  start: number,
  end: number,
  bpm: number | null,
): RhythmStroke[] {
  const duration = Math.max(0.1, end - start);
  const subdivisionDuration =
    bpm && bpm > 0 ? 30 / bpm : duration / 16;
  const slotCount = Math.max(
    1,
    Math.min(16, Math.round(duration / subdivisionDuration)),
  );
  const soundedBySlot = new Map<number, RhythmAttack>();

  for (const attack of attacks) {
    const index = Math.round((attack.time - start) / subdivisionDuration);
    if (index < 0 || index >= slotCount) continue;
    const current = soundedBySlot.get(index);
    if (!current || attack.strength > current.strength) {
      soundedBySlot.set(index, attack);
    }
  }

  return Array.from({ length: slotCount }, (_, index) => {
    const attack = soundedBySlot.get(index);
    return {
      index,
      time: start + index * subdivisionDuration,
      direction: index % 2 === 0 ? "down" : "up",
      sounded: attack !== undefined,
      strength: attack?.strength ?? 0,
    };
  });
}
