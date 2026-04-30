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
}

const DEFAULT_BUFFER = 2048;

/**
 * YIN pitch detection (de Cheveigné & Kawahara 2002) with parabolic
 * interpolation. Targets ~±2 cent accuracy on monophonic guitar input.
 *
 * Steps 1-3 of the YIN paper:
 *   d(τ)   = Σ (x[i] - x[i+τ])²
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
  const tauMax = Math.min(Math.floor(N / 2), Math.floor(sampleRate / minFreq));
  if (tauMax <= tauMin) return { frequency: null, clarity: 0 };

  const yinBuf = new Float32Array(tauMax + 1);

  // Step 1: difference function
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < N - tau; i++) {
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
    yinBuf[tau] = (yinBuf[tau] * tau) / runningSum;
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

/**
 * Manages AudioContext + getUserMedia and runs YIN on each audio frame.
 * Safari iOS requires a user gesture before `start()` resolves — call it from
 * an onClick / onPointerDown handler.
 */
export function usePitchDetection(options: Options = {}) {
  const {
    bufferSize = DEFAULT_BUFFER,
    threshold = 0.15,
    minFrequency = 70,
    maxFrequency = 1200,
    silenceRms = 0.01,
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
  const rafRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
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
    setRunning(false);
    setReading({ frequency: null, clarity: 0, rms: 0 });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (running) return;

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

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = bufferSize;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      ctxRef.current = ctx;
      streamRef.current = stream;
      sourceRef.current = source;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      setRunning(true);

      const tick = () => {
        const analyserNode = analyserRef.current;
        const buf = bufferRef.current;
        const audioCtx = ctxRef.current;
        if (!analyserNode || !buf || !audioCtx) return;

        analyserNode.getFloatTimeDomainData(buf);

        let sumSquares = 0;
        for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
        const rms = Math.sqrt(sumSquares / buf.length);

        if (rms < silenceRms) {
          setReading({ frequency: null, clarity: 0, rms });
        } else {
          const { frequency, clarity } = yinDetect(
            buf,
            audioCtx.sampleRate,
            threshold,
            minFrequency,
            maxFrequency,
          );
          setReading({ frequency, clarity, rms });
        }

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
    minFrequency,
    running,
    silenceRms,
    stop,
    threshold,
  ]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { reading, running, error, start, stop };
}
