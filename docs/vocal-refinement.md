# Vocal-first refinement

The song screen exposes Full Song, Vocals, and Vocals + Rhythm Guitar. Lead
artifacts remain stored but are not a listening choice. Combined playback uses
the existing shared transport, with equal half-gain tracks for headroom. The
download mixes the same selected layers at half gain and rejects mismatched
sample rates or durations. Combined guitar is explicitly best-available when a
dedicated rhythm layer is unavailable.

New worker runs keep the BS-RoFormer specialist output separate and publish it
without the energy-only broader-stem blend. Technical checks reject empty,
non-finite, clipping, wrong-format or truncated candidates. These checks cannot
prove every word is present or measure perceived quality. Existing library URLs
are not migrated by this release. Model failure retains the existing fallback.

Verified: build, lint, TypeScript, mixed-export sample test, browser dual-track
playback/seek and actual WAV export, plus two cached specialist outputs passing
technical validation. iPhone hardware/background behavior is not verified.

Remaining quality gate: compare BS-RoFormer and a vocal-specialist Mel-Band
RoFormer on representative source excerpts, listening for instrumental leakage,
missing syllables and watery artifacts. Do not auto-replace library vocals based
only on loudness, transcript agreement or these technical checks.
