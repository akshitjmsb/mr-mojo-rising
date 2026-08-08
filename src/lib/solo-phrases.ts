import type { TabNote } from "./database.types";

export type PracticePhrase = {
  start: number;
  end: number;
};

type PhraseOptions = {
  minimumDuration?: number;
  maximumDuration?: number;
  pauseThreshold?: number;
  leadIn?: number;
  tail?: number;
};

/**
 * Split a transcription at real rests where possible, with a maximum phrase
 * length as a safety rail. Small lead/tail handles preserve musical context.
 */
export function buildMusicalPhrases(
  notes: TabNote[],
  sectionStart: number,
  sectionEnd: number,
  options: PhraseOptions = {},
): PracticePhrase[] {
  const minimumDuration = options.minimumDuration ?? 1.8;
  const maximumDuration = options.maximumDuration ?? 5.5;
  const pauseThreshold = options.pauseThreshold ?? 0.28;
  const leadIn = options.leadIn ?? 0.22;
  const tail = options.tail ?? 0.28;
  const sectionNotes = notes
    .filter(
      (note) =>
        note.start_time >= sectionStart && note.start_time < sectionEnd,
    )
    .toSorted((a, b) => a.start_time - b.start_time);

  if (sectionNotes.length === 0) return [];

  const phrases: PracticePhrase[] = [];
  let phraseStartIndex = 0;

  while (phraseStartIndex < sectionNotes.length) {
    const first = sectionNotes[phraseStartIndex];
    let cutIndex = sectionNotes.length;
    let bestFallbackIndex = -1;
    let bestFallbackGap = Number.NEGATIVE_INFINITY;

    for (let index = phraseStartIndex + 1; index < sectionNotes.length; index++) {
      const previous = sectionNotes[index - 1];
      const current = sectionNotes[index];
      const elapsed = current.start_time - first.start_time;
      const previousEnd = previous.start_time + Math.max(previous.duration, 0);
      const gap = current.start_time - previousEnd;

      if (elapsed >= minimumDuration && gap > bestFallbackGap) {
        bestFallbackGap = gap;
        bestFallbackIndex = index;
      }

      if (elapsed >= minimumDuration && gap >= pauseThreshold) {
        cutIndex = index;
        break;
      }

      if (elapsed >= maximumDuration) {
        cutIndex =
          bestFallbackIndex > phraseStartIndex
            ? bestFallbackIndex
            : index;
        break;
      }
    }

    const last = sectionNotes[Math.max(phraseStartIndex, cutIndex - 1)];
    phrases.push({
      start: Math.max(sectionStart, first.start_time - leadIn),
      end: Math.min(
        sectionEnd,
        first.start_time + maximumDuration,
        Math.max(last.start_time + Math.max(last.duration, 0) + tail, first.start_time + 0.5),
      ),
    });
    phraseStartIndex = cutIndex;
  }

  return phrases;
}
