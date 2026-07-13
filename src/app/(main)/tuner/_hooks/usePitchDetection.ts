"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PitchReading {
  frequency: number | null;
  clarity: number;
  rms: number;
}

interface Options {
  bufferSize?: number;
  threshold?: number;
  minFrequency?: number;
  maxFrequency?: number;
  silenceRms?: number;
  minClarity?: number;
}

// 4096 samples so τ can reach ~60 Hz periods; YIN still sums over a fixed
// 2048-sample window, so cost stays the same as the old 2048 buffer.
const DEFAULT_BUFFER = 4096;
const YIN_WINDOW = 2048;

// Frames below this clarity are treated as noise, not pitch.
const DEFAULT_MIN_CLARITY = 0.75;
// Keep showing the last good reading this long after the signal decays below
// the gates, so the display doesn't blink out mid-pluck.
const HOLD_MS = 350;
// A new reading further than this from the running median resets the smoother
// immediately (new string plucked) instead of dragging through stale frames.
const RETUNE_CENTS = 120;
const HISTORY_SIZE = 5;
// React state updates are throttled; TuningGauge interpolates between them.
const UI_UPDATE_MS = 66;

/**
 * YIN pitch detection (de Cheveigné & Kawahara 2002) with parabolic
 * interpolation. Targets ~±2 cent accuracy on monophonic guitar input.
 *
 * Steps 1-3 of the YIN paper:
 *   d(τ)   = Σ_{i<W} (x[i] - x[i+τ])²
 *   d'(τ)  = d(τ) / ((1/τ) · Σ_{j=1..τ} d(j))    cumulative mean normalized
 *   pick the first τ below `threshold` that is also a local minimum.
 * Then refine τ with parabolic interpolation against its neighbours.
 */
function yinDetect(
  samples: Float32Array,
  sampleRate: number,
  threshold: number,
  minFreq: number,
  maxFreq: number,
): { frequency: number | null; clarity: number } {
  const N = samples.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.min(
    N - Math.floor(N / 4),
    Math.floor(sampleRate / minFreq),
  );
  if (tauMax <= tauMin) return { frequency: null, clarity: 0 };

  // Fixed comparison window: every τ is scored over the same number of
  // sample pairs, which keeps d'(τ) comparable across the whole lag range.
  const W = Math.min(YIN_WINDOW, N - tauMax);

  const yinBuf = new Float32Array(tauMax + 1);

  // Step 1: difference function
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    yinBuf[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference
  yinBuf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += yinBuf[tau];
    yinBuf[tau] = runningSum === 0 ? 1 : (yinBuf[tau] * tau) / runningSum;
  }

  // Step 3: absolute threshold — find first dip below threshold and descend
  // into the local minimum.
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinBuf[tau] < threshold) {
      while (tau + 1 <= tauMax && yinBuf[tau + 1] < yinBuf[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }

  // Fallback: take global minimum in range — clarity will be low.
  if (tauEstimate === -1) {
    let minVal = Infinity;
    let minTau = -1;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (yinBuf[tau] < minVal) {
        minVal = yinBuf[tau];
        minTau = tau;
      }
    }
    if (minTau === -1 || minVal > 0.6) return { frequency: null, clarity: 0 };
    tauEstimate = minTau;
  }

  // Step 4: parabolic interpolation (~±2 cent accuracy boost)
  const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
  const x2 = tauEstimate + 1 <= tauMax ? tauEstimate + 1 : tauEstimate;
  let betterTau: number;
  if (x0 === tauEstimate) {
    betterTau = yinBuf[tauEstimate] <= yinBuf[x2] ? tauEstimate : x2;
  } else if (x2 === tauEstimate) {
    betterTau = yinBuf[tauEstimate] <= yinBuf[x0] ? tauEstimate : x0;
  } else {
    const s0 = yinBuf[x0];
    const s1 = yinBuf[tauEstimate];
    const s2 = yinBuf[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    betterTau = denom === 0 ? tauEstimate : tauEstimate + (s2 - s0) / denom;
  }

  const frequency = sampleRate / betterTau;
  if (frequency < minFreq || frequency > maxFreq)
    return { frequency: null, clarity: 0 };

  return { frequency, clarity: 1 - yinBuf[tauEstimate] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Manages AudioContext + getUserMedia and runs YIN on each audio frame.
 *
 * Raw per-frame YIN output is too jittery to display directly, so the hook
 * publishes a *stabilised* reading: frames are gated on RMS + clarity, the
 * survivors go through a short median filter (with an instant reset when a
 * new string is plucked), the last good value is held through pluck decay,
 * and React state updates are throttled to ~15 Hz.
 *
 * Safari iOS requires a user gesture before `start()` resolves — call it from
 * an onClick / onPointerDown handler.
 */
export function usePitchDetection(options: Options = {}) {
  const {
    bufferSize = DEFAULT_BUFFER,
    threshold = 0.15,
    minFrequency = 60,
    maxFrequency = 1200,
    silenceRms = 0.01,
    minClarity = DEFAULT_MIN_CLARITY,
  } = options;

  const [reading, setReading] = useState<PitchReading>({
    frequency: null,
    clarity: 0,
    rms: 0,
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const runningRef = useRef(false);

  // Smoothing state (refs — mutated every frame, no re-renders).
  const historyRef = useRef<number[]>([]);
  const stableFreqRef = useRef<number | null>(null);
  const lastAcceptedAtRef = useRef(0);
  const lastUiUpdateRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    filtersRef.current.forEach((f) => f.disconnect());
    filtersRef.current = [];
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    bufferRef.current = null;
    historyRef.current = [];
    stableFreqRef.current = null;
    runningRef.current = false;
    setRunning(false);
    setReading({ frequency: null, clarity: 0, rms: 0 });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (runningRef.current) return;

    try {
      // Safari requires the AudioContext to be created/resumed inside the
      // user-gesture callback that invoked `start`.
      const AnyAudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AnyAudioCtx();
      if (ctx.state === "suspended") await ctx.resume();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      // iOS can re-suspend the context while the async mic prompt is up.
      if (ctx.state === "suspended") await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);

      // Pre-filter: kill DC/rumble below the low string, and shave the
      // harmonic-rich top end that makes YIN lock onto overtones.
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 45;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1500;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = bufferSize;
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(analyser);

      ctxRef.current = ctx;
      streamRef.current = stream;
      sourceRef.current = source;
      filtersRef.current = [highpass, lowpass];
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      runningRef.current = true;
      setRunning(true);

      const publish = (
        frequency: number | null,
        clarity: number,
        rms: number,
        now: number,
      ) => {
        // Throttle React updates; always flush signal↔silence transitions so
        // the UI never lags a state change.
        const changedNullness =
          (frequency === null) !== (stableFreqRef.current === null);
        if (!changedNullness && now - lastUiUpdateRef.current < UI_UPDATE_MS)
          return;
        lastUiUpdateRef.current = now;
        setReading({ frequency, clarity, rms });
      };

      const tick = () => {
        const analyserNode = analyserRef.current;
        const buf = bufferRef.current;
        const audioCtx = ctxRef.current;
        if (!analyserNode || !buf || !audioCtx) return;

        analyserNode.getFloatTimeDomainData(buf);

        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
        const rms = Math.sqrt(sumSquares / buf.length);

        const now = performance.now();
        let frequency: number | null = null;
        let clarity = 0;

        if (rms >= silenceRms) {
          const result = yinDetect(
            buf,
            audioCtx.sampleRate,
            threshold,
            minFrequency,
            maxFrequency,
          );
          frequency = result.frequency;
          clarity = result.clarity;
        }

        const accepted = frequency !== null && clarity >= minClarity;

        if (accepted && frequency !== null) {
          const history = historyRef.current;
          const prev = stableFreqRef.current;
          // New pluck far from the current note: reset instead of dragging
          // the median through stale frames.
          if (
            prev !== null &&
            Math.abs(1200 * Math.log2(frequency / prev)) > RETUNE_CENTS
          ) {
            history.length = 0;
          }
          history.push(frequency);
          if (history.length > HISTORY_SIZE) history.shift();
          stableFreqRef.current = median(history);
          lastAcceptedAtRef.current = now;
        } else if (now - lastAcceptedAtRef.current > HOLD_MS) {
          historyRef.current.length = 0;
          stableFreqRef.current = null;
        }
        // else: within the hold window — keep the previous stable reading.

        publish(stableFreqRef.current, clarity, rms, now);

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not access the microphone.";
      setError(
        message.includes("Permission") ||
          message.includes("denied") ||
          message.includes("NotAllowed")
          ? "Microphone permission denied. Enable it in Safari settings and reload."
          : message,
      );
      stop();
    }
  }, [
    bufferSize,
    maxFrequency,
    minClarity,
    minFrequency,
    silenceRms,
    stop,
    threshold,
  ]);

  // iOS suspends the AudioContext when the tab backgrounds and does not
  // resume it on return — without this the tuner comes back frozen.
  useEffect(() => {
    if (!running) return;
    const onVisible = () => {
      const ctx = ctxRef.current;
      if (document.visibilityState === "visible" && ctx?.state === "suspended")
        ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [running]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { reading, running, error, start, stop };
}
