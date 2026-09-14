# Vocal-first refinement

The song screen exposes Full Song, Vocals, and Vocals + Rhythm Guitar. Lead
artifacts remain stored but are not a listening choice. Combined playback and
download use one server-rendered asset. The renderer resamples guitar to the
vocal sample rate, balances active levels with a bounded gain, and preserves
headroom without altering source stems. Mismatched durations and silent sources
are rejected. Combined guitar is explicitly best-available when a
dedicated rhythm layer is unavailable.

New worker runs keep the BS-RoFormer specialist output separate and publish it
without the energy-only broader-stem blend. Technical checks reject empty,
non-finite, clipping, wrong-format or truncated candidates. These checks cannot
prove every word is present or measure perceived quality. Existing library URLs
are not migrated by this release. Model failure retains the existing fallback.

Verified: build, lint, TypeScript, mixed-export sample test, plus two cached specialist outputs passing
technical validation. iPhone hardware/background behavior is not verified.

Remaining quality gate: compare BS-RoFormer and a vocal-specialist Mel-Band
RoFormer on representative source excerpts, listening for instrumental leakage,
missing syllables and watery artifacts. Do not auto-replace library vocals based
only on loudness, transcript agreement or these technical checks.
