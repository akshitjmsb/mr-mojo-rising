"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  frequencyDataToChroma,
  type ChromaFrame,
} from "@/lib/listen-match";

const FFT_SIZE = 8192;
const CAPTURE_INTERVAL_MS = 70;

export function useRhythmCapture() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frequencyBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const timeBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const animationRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const captureStartedAtRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const framesRef = useRef<ChromaFrame[]>([]);
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    capturingRef.current = false;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    filtersRef.current.forEach((filter) => filter.disconnect());
    filtersRef.current = [];
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    frequencyBufferRef.current = null;
    timeBufferRef.current = null;
    setStarting(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (contextRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is unavailable in this browser.");
      return false;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setStarting(true);

    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("Audio input is unavailable in this browser.");
      }
      const context = new AudioContextConstructor();
      if (context.state === "suspended") await context.resume();

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

      if (generationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop());
        await context.close().catch(() => {});
        return false;
      }
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 55;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1800;
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.2;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -10;
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(analyser);

      contextRef.current = context;
      streamRef.current = stream;
      sourceRef.current = source;
      filtersRef.current = [highpass, lowpass];
      analyserRef.current = analyser;
      frequencyBufferRef.current = new Float32Array(
        new ArrayBuffer(analyser.frequencyBinCount * 4),
      );
      timeBufferRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4),
      );
      setStarting(false);

      const tick = () => {
        const currentAnalyser = analyserRef.current;
        const context = contextRef.current;
        const frequencyBuffer = frequencyBufferRef.current;
        const timeBuffer = timeBufferRef.current;
        if (!currentAnalyser || !context || !frequencyBuffer || !timeBuffer)
          return;

        const now = performance.now();
        if (
          capturingRef.current &&
          now - lastCaptureAtRef.current >= CAPTURE_INTERVAL_MS
        ) {
          lastCaptureAtRef.current = now;
          currentAnalyser.getFloatTimeDomainData(timeBuffer);
          currentAnalyser.getFloatFrequencyData(frequencyBuffer);
          let sumSquares = 0;
          for (const sample of timeBuffer) sumSquares += sample * sample;
          framesRef.current.push({
            time: (now - captureStartedAtRef.current) / 1000,
            rms: Math.sqrt(sumSquares / timeBuffer.length),
            chroma: frequencyDataToChroma(
              frequencyBuffer,
              context.sampleRate,
              currentAnalyser.fftSize,
            ),
          });
        }
        animationRef.current = requestAnimationFrame(tick);
      };
      animationRef.current = requestAnimationFrame(tick);
      return true;
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : "";
      const message = caught instanceof Error ? caught.message : "";
      setError(
        name === "NotAllowedError" || /permission|denied/i.test(message)
          ? "Microphone is blocked. Allow access, then try again."
          : name === "NotFoundError"
            ? "No microphone was found."
            : message || "The microphone could not start.",
      );
      stop();
      return false;
    }
  }, [stop]);

  const beginCapture = useCallback(() => {
    framesRef.current = [];
    captureStartedAtRef.current = performance.now();
    lastCaptureAtRef.current = 0;
    capturingRef.current = true;
  }, []);

  const finishCapture = useCallback(() => {
    capturingRef.current = false;
    return [...framesRef.current];
  }, []);

  useEffect(() => stop, [stop]);

  return {
    starting,
    error,
    start,
    stop,
    beginCapture,
    finishCapture,
  };
}
