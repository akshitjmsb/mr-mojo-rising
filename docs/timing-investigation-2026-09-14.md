# Timing quality investigation — not ready for release

## Scope

Song `6de35955-99fa-467a-8a96-0cdfb501cba9`, Sabse Peeche Hum Khade.
Preserve vocals and vocals+rhythm audio exactly. User requires recording-level
timing validation before shipping. Current production is commit `33da431`.
No production data or audio has been changed during this investigation.

## Evidence

- Saved lyrics have 28 lines. Unprompted Hindi recognition using separate 45s
  windows recovered the opening four-line passage twice. The saved catalog
  contains that passage once, so monotonic text matching can assign words to
  the wrong repetition even with high overall word coverage.
- Fresh recognition vs saved starts: 9/18 strongly matched line starts differ
  by >250ms. Two differ by ~17s (different occurrences, not a global offset).
- Read-only guitar attack audit: 19/137 published chord starts >180ms from the
  closest detected attack; one >500ms. Attack proximity is NOT harmonic truth.
- Independent MMS forced alignment is available locally. Full-song alignment
  without occurrence expansion can stretch words into unrelated regions.
- Occurrence recovery currently proposes 33 lines, but ASR appears to miss
  material near the end. Do not drop catalog content merely because one ASR
  pass missed it. Need a reconciled complete sequence before promotion.
- Local native-script MMS alignment with context wildcard tokens: 51 low-score
  words (<0.5) and 40 starts >250ms from ASR. This is a FAIL, not a release.
  Low score thresholds are provisional diagnostics, not calibrated accuracy.

## Local changes

- BTC features now preserve sample-derived frame timestamps within each CQT
  chunk; inference reads these instead of assuming uniform nominal frames.
  Chunk reset means old mismatch is only ~31ms within each 10s chunk, NOT
  ~0.8s accumulating across the song. This is not the main reported fault.
- `lyric_occurrences.py` recovers repeat candidates without reusing heard words.
- `timing_quality.py` rejects missing/low-score/disagreeing timing anchors;
  explicitly calls its output agreement, never ground truth.
- `audit_song_timing.py`, `audit_chord_timing.py`, and `check_*timing.py` are
  experimental read-only tools. They do not write the library or audio.

## Artifacts (ignored, within project)

`.runtime/lyric-review/` contains the original candidate, fresh ASR windows,
timing-audit.json, chord-timing-audit.json, lyric-occurrences.json,
mms-vocal-emissions.npz, forced-timing-candidate.json,
forced-occurrence-candidate.json, local-phoneme-candidate.json.

MMS checkpoint: `.runtime/cache/torch/checkpoints/model.pt` (~1.18GiB).
Uroman 1.3.1.1 is isolated in `.runtime/lyric-review/python-deps`, not installed
in the production worker environment. No paid services used.

## Next work / release gate

1. Reconcile complete occurrences with overlapping recognition around boundaries
   and the final sung passages; compare independently to acoustic emissions.
2. Resolve phoneme timing failures (romanization, stretched tokens, ambiguous
   onsets), without replacing them with uniform spacing or arbitrary offsets.
3. Validate chord *change* evidence on guitar, not merely nearest strums. Keep
   estimated chord labels distinct from supported transition timestamps.
4. Only then integrate the successful path into processing/backfill. Preserve
   revisions and verify the exact vocal/mix URLs have not changed.
5. Browser-test playback, backward/forward seek, repeated lines and selected
   loops. Build/unit tests do not establish real audio timing accuracy.
6. Push/deploy only after those gates. Do not claim fully synchronized now.

## Follow-up: ending and recording-level repeat checks

- `check_lyric_tail.py` uses 185–225, 195–235 and 205–245 second windows.
  The first recovered the complete final verse plus four final refrains; the
  others corroborate some repeats but omit/truncate others. Cached tail-review.json.
- `check_complete_lyric_timing.py` builds a 37-line, 160-word experimental
  sequence (30 opening/middle occurrences plus seven ending lines). No data
  was published. This resolves nine omitted line occurrences compared to the
  original catalog, but word boundaries remain under review.
- Canonical romanized long-vowel normalization and MMS boundary-token scores
  were tested separately from average word scores. 41 word starts / 12 line
  starts remain below a provisional 0.7 token score. Not a calibrated gate.
- `check_repeat_audio_timing.py` aligns MFCCs directly between repeated vocal
  phrases. 16/17 mapped first-word starts agree with the acoustic candidate
  within 30ms. One does NOT: second opening phrase candidate40.06 vs direct
  audio mapping39.10 seconds. Its phoneme start score is0.002. Local vocal
  attack detection also finds an attack at39.10s. Do not ship the40.06 value.
- Repeat-audio cost thresholds are not calibrated. Need per-word / reverse
  mapping validation, not a blanket "all timings verified" claim.
- `check_guitar_chord_candidate.py` tried BTC on the guitar stem with corrected
  frame clocks:135 raw /117 merged /27 acoustically supported intervals. This
  does not improve on the existing32 supported intervals; DO NOT replace the
  production chord sequence with this trial.
- New artifacts: tail-*.json, tail-review.json, complete-timing-candidate.json,
  repeat-audio-audit.json, guitar-chord-candidate.json. All runs finished.

## Verification limit / release held

- Added `repeat_timing.py` and tests for known shifts, stretched/ambiguous paths,
  missing mappings, and reverse consistency. Audio transfer now rejects broad
  mappings (>80ms) and round-trip discrepancies (>50ms).
- Of41 initially weak word starts,26 have a strong source boundary (>=0.8)
  and an unambiguous repeat-audio transfer.15 remain unresolved under these
  provisional checks. Two transfers were ambiguous despite apparently close
  forward-only timestamps; this is why one-direction agreement was insufficient.
- `check_remaining_word_timing.py` records those15 in remaining-word-audit.json.
  Several internal-word estimates are within250ms of ASR, but the reference
  itself is not independently verified. Four line-start disagreements remain
  ~0.74–1.9s; they cannot be certified from these scores.
- All runs are finished. No production changes, no new deployment, no audio
  mutations. Existing live lyrics/chords remain imperfect at33da431.
- Automatic continuation is paused pending user direction on a listening
  review of unresolved sections. User requested robust verification before
  release; do not lower thresholds or claim perfect sync to force completion.

## Reviewed best-supported release

The user subsequently requested completion and shipment without a manual
listening review. Release scope is the supported improvements, not a claim
that the original perfect-sync requirement has been met:

- `publish-reviewed-lyrics.ts` packages 37 occurrences / 160 words, including
  the opening repeat and four ending refrains. It applies 26 high-anchor,
  bidirectionally consistent repeat transfers. Fifteen weak word boundaries
  remain estimates. The UI and data explicitly identify estimated timing.
- Validation rejects stale evidence, invalid/reversed boundaries, conflicting
  transfers, changed audio assets and concurrent lyric edits. Publishing saves
  a revision in the same transaction and is idempotent. Audio is not rewritten.
- Existing chord sequence is retained. The rejected guitar-only experiment is
  not published. The BTC frame-clock correction applies to future analysis;
  existing postprocessed chord boundaries are NOT blindly rescaled.
- These recording-specific reviewed repairs do not automatically certify new
  imports. Generalized repeat recovery and independent harmonic timing
  validation remain unfinished; the system must not advertise perfect sync.

Release checks: 8 TypeScript tests; 9 timing Python tests; 12 lyric Python
tests; 7 chord truth-gate tests; targeted ESLint and production build passed.
Local production browser verified all 160 word highlights, 274 chord display
boundaries, 28 line-boundary/backseek checks, and the 27.03–49.37 section loop.
These checks prove rendering follows stored times, NOT that every stored time
matches musical ground truth. The worker was restarted idle and reports ready.
