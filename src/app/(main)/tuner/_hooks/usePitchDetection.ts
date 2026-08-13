"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PitchReading {
  frequency: number | null;
  clarity: number;
  rms: number;
  stable: boolean;
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
const ANALYSIS_INTERVAL_MS = 40;
const STABLE_HISTORY_SIZE = 4;
const STABLE_SPREAD_CENTS = 6;

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
export function yinDetect(
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

function centsSpread(values: number[]) {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const center = median(values);
  return Math.max(
    ...values.map((value) => Math.abs(1200 * Math.log2(value / center))),
  );
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
    stable: false,
  });
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const startGenerationRef = useRef(0);

  // Smoothing state (refs — mutated every frame, no re-renders).
  const historyRef = useRef<number[]>([]);
  const stableFreqRef = useRef<number | null>(null);
  const lastAcceptedAtRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const lastPublishedFrequencyRef = useRef<number | null>(null);
  const lastAnalysisAtRef = useRef(0);
  const noiseFloorRef = useRef(0.003);

  const stop = useCallback(() => {
    startGenerationRef.current += 1;
    runningRef.current = false;
    startingRef.current = false;
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
    lastPublishedFrequencyRef.current = null;
    setRunning(false);
    setStarting(false);
    setReading({ frequency: null, clarity: 0, rms: 0, stable: false });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (runningRef.current || startingRef.current) return;
    const generation = startGenerationRef.current + 1;
    startGenerationRef.current = generation;
    startingRef.current = true;
    setStarting(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is unavailable in this browser.");
      }
      // Safari requires the AudioContext to be created/resumed inside the
      // user-gesture callback that invoked `start`.
      const AnyAudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AnyAudioCtx) {
        throw new Error("Audio input is unavailable in this browser.");
      }
      const ctx = new AnyAudioCtx();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });
      } catch (microphoneError) {
        if (
          microphoneError instanceof DOMException &&
          (microphoneError.name === "OverconstrainedError" ||
            microphoneError.name === "NotSupportedError")
        ) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        } else {
          throw microphoneError;
        }
      }

      if (startGenerationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        await ctx.close().catch(() => {});
        return;
      }
      streamRef.current = stream;
      const microphoneTrack = stream.getAudioTracks()[0];
      microphoneTrack?.addEventListener(
        "ended",
        () => {
          if (!runningRef.current) return;
          setError("The microphone disconnected. Reconnect it and try again.");
          stop();
        },
        { once: true },
      );

      // iOS can re-suspend the context while the async mic prompt is up.
      if (ctx.state === "suspended") await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);

      // Pre-filter: kill DC/rumble below the low string, and shave the
      // harmonic-rich top end that makes YIN lock onto overtones.
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = Math.max(20, minFrequency * 0.65);
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1500;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = bufferSize;
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(analyser);

      sourceRef.current = source;
      filtersRef.current = [highpass, lowpass];
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      runningRef.current = true;
      startingRef.current = false;
      setStarting(false);
      setRunning(true);

      const publish = (
        frequency: number | null,
        clarity: number,
        rms: number,
        stable: boolean,
        now: number,
      ) => {
        // Throttle React updates; always flush signal↔silence transitions so
        // the UI never lags a state change.
        const changedNullness =
          (frequency === null) !==
          (lastPublishedFrequencyRef.current === null);
        if (!changedNullness && now - lastUiUpdateRef.current < UI_UPDATE_MS)
          return;
        lastUiUpdateRef.current = now;
        lastPublishedFrequencyRef.current = frequency;
        setReading({ frequency, clarity, rms, stable });
      };

      const tick = () => {
        const analyserNode = analyserRef.current;
        const buf = bufferRef.current;
        const audioCtx = ctxRef.current;
        if (!analyserNode || !buf || !audioCtx) return;

        const now = performance.now();
        if (now - lastAnalysisAtRef.current < ANALYSIS_INTERVAL_MS) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastAnalysisAtRef.current = now;

        analyserNode.getFloatTimeDomainData(buf);

        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
        const rms = Math.sqrt(sumSquares / buf.length);

        let frequency: number | null = null;
        let clarity = 0;

        const adaptiveGate = Math.max(silenceRms, noiseFloorRef.current * 2.5);
        if (rms >= adaptiveGate) {
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
        if (!accepted && rms < Math.max(silenceRms * 1.5, 0.02)) {
          noiseFloorRef.current =
            noiseFloorRef.current * 0.97 + Math.max(0.0005, rms) * 0.03;
        }
        // else: within the hold window — keep the previous stable reading.

        const history = historyRef.current;
        const stable =
          stableFreqRef.current !== null &&
          history.length >= STABLE_HISTORY_SIZE &&
          centsSpread(history) <= STABLE_SPREAD_CENTS;
        publish(stableFreqRef.current, clarity, rms, stable, now);

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      const message = e instanceof Error ? e.message : "";
      setError(
        name === "NotAllowedError" || /permission|denied/i.test(message)
          ? "Microphone is blocked. Allow access in browser settings, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect one and try again."
            : message || "The microphone could not start. Try again.",
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
      const state = ctx?.state as string | undefined;
      if (
        ctx &&
        document.visibilityState === "visible" &&
        state !== "running" &&
        state !== "closed"
      )
        ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [running]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { reading, running, starting, error, start, stop };
}
