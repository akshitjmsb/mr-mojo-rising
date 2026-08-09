import type { TabNote } from "./database.types";

const ONSET_CLUSTER_SECONDS = 0.045;

function noteScore(note: TabNote, previousPitch: number | null) {
  const confidence = note.confidence ?? 0.7;
  const continuity =
    previousPitch === null ? 0 : -Math.abs(note.midi_pitch - previousPitch) * 0.035;
  return confidence * 2 + note.midi_pitch * 0.012 + note.duration * 0.08 + continuity;
}

/**
 * Reduce simultaneous notes from the polyphonic guitar transcription to one
 * high-confidence melodic line. Arpeggiated notes remain intact; only onset
 * stacks that cannot all belong to a monophonic lead line are reduced.
 */
export function extractLeadNotes(notes: TabNote[]): TabNote[] {
  const ordered = [...notes].sort(
    (left, right) =>
      left.start_time - right.start_time || right.midi_pitch - left.midi_pitch,
  );
  const lead: TabNote[] = [];
  let index = 0;

  while (index < ordered.length) {
    const cluster = [ordered[index]];
    let next = index + 1;
    while (
      next < ordered.length &&
      ordered[next].start_time - ordered[index].start_time <= ONSET_CLUSTER_SECONDS
    ) {
      cluster.push(ordered[next]);
      next += 1;
    }

    const previousPitch = lead.at(-1)?.midi_pitch ?? null;
    const selected = cluster.reduce((best, note) =>
      noteScore(note, previousPitch) > noteScore(best, previousPitch)
        ? note
        : best,
    );
    lead.push(selected);
    index = next;
  }

  return lead;
}
