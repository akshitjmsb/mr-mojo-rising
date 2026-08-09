import type { TabNote } from "./database.types";

export type RhythmAttack = {
  time: number;
  strength: number;
  noteCount: number;
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
