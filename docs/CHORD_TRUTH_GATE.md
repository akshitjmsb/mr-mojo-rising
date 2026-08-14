# Chord truth gate

## Product contract

Mr. Mojo Rising never treats a model probability as musical truth. Chords are
shown to a learner only after this recording supplies independent acoustic
evidence. If the evidence is incomplete or contradictory, the app withholds
the chord instead of filling the gap with a guess.

This is an abstention contract, not a claim that probabilistic software can
prove music with mathematical certainty.

## License-safe boundary

The chord pipeline accepts only audio the user chose to process and stems that
this product derived from that audio. It does not search, scrape, ingest, cache,
or reproduce Songsterr, Ultimate Guitar, sheet music, web chord pages, or other
human-authored song annotations.

The implementation uses source-code dependencies with permissive licenses:

- BTC-ISMIR19 candidate recognizer — MIT
  <https://github.com/jayg996/BTC-ISMIR19/blob/master/LICENSE>
- librosa signal analysis — ISC
  <https://github.com/librosa/librosa/blob/main/LICENSE.md>
- Demucs stem separation — MIT
  <https://github.com/facebookresearch/demucs>

Those licenses cover the software components, not the user's source recording.
This document is an engineering boundary and not legal advice.

## Evidence pipeline

1. BTC listens to the full mix and proposes time-aligned concert-pitch chords.
2. The truth gate calculates fresh chroma evidence from the isolated guitar.
3. The candidate must be the best-supported core harmony, clear its acoustic
   score and ambiguity margin, and remain stable across the interval. The gate
   deliberately collapses unproven 6th/7th extensions to the verified
   major/minor core instead of inventing precision from melody notes.
4. When an active bass stem exists, its strongest pitch and chord-tone support
   must not contradict the candidate.
5. Every candidate and its evidence are recorded. The song API exposes only
   rows whose verification state is `verified`.

The model and verifier are deliberately different: the candidate comes from a
learned full-mix recognizer; acceptance comes from deterministic measurements
on separated stems.

## What the gate proves

The gate verifies the sounding, concert-pitch harmony supported by the audio.
It does not claim to know the original guitarist's exact voicing, fingering,
capo, or tuning from audio alone. A displayed chord shape is a playable shape
for that verified harmony, not a licensed transcription of a performer's hand
position.

## Release rule

Existing model-only chord rows are intentionally hidden. Each existing song
must be reanalyzed after the additive `chord_verifications` migration. A song
with zero accepted chords should say that nothing passed audio verification;
it must never silently fall back to the old rows.
