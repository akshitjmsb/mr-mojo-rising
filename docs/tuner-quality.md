# Tuner quality gate

The tuner measures a single sustained string at A4 = 440 Hz. It must never
silently fold octaves to make a target look correct. A harmonic-only sound
cannot prove which physical string produced it; use an open string and mute
the others. No microphone tuner is guaranteed accurate in every room/device.

## Automated checks

Run:

```
npx tsx --test 'src/app/(main)/tuner/_hooks/usePitchDetection.test.ts' 'src/app/(main)/tuner/_lib/'*.test.ts
npm run lint
npm run build
```

The tests cover every supported open-string frequency at 16, 22.05, 24,
44.1, 48 and 96 kHz, detuning, dominant second harmonics, quiet decays,
noise/DC/silence rejection, all tuning/string identities, wrong octaves,
consecutive-frame stability and immediate removal of stale green readings.
The pure-signal benchmark is under two cents; it is not a real-world guarantee.

## Browser audio and lifecycle checks

Start the local server, open `/tuner` in agent-browser, and click once to unlock
Web Audio. Then run:

```
agent-browser eval --stdin < scripts/check-tuner-browser.js
```

This localhost-only fixture injects an oscillator through a MediaStream and
the real filters, analyser, downsampling, detector and UI. It does not access
the physical microphone. It checks flat/sharp/quiet/silent/clipped signals,
wrong-octave warnings, cancel/restart with late permission success and failure,
muted-track reconnect, and permission-denied/busy retry paths. It stops its
tracks and restores getUserMedia in a finally block.

## Hardware acceptance (still requires a real guitar and phone)

- Compare every open string with a trusted hardware tuner, including low/high E
  and repeated note names in Drop D/Open G.
- Test soft and normal plucks near the phone; mute unused strings.
- Stop a note: green must clear. Background/return, receive a call, disconnect
  a headset and reconnect: no stale reading may remain green.
- Test Safari and the installed iPhone PWA; verify microphone permission denial,
  cancellation and retry. Bluetooth microphone processing can alter the input.
- Stop or navigate away: the microphone indicator must turn off.

Do not label hardware acceptance complete based only on synthetic tests.
