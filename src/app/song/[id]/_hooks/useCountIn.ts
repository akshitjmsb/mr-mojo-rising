"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Options {
  bpm: number | null | undefined;
  speed: number;
  onComplete: () => void;
}

/** Four-beat Web Audio count-in with cancellable scheduled clicks. */
export function useCountIn({ bpm, speed, onComplete }: Options) {
  const [beat, setBeat] = useState<number | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const cancel = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
    if (contextRef.current) {
      void contextRef.current.close();
      contextRef.current = null;
    }
    setBeat(null);
  }, []);

  const start = useCallback(() => {
    cancel();
    if (!bpm || bpm <= 0) {
      onCompleteRef.current();
      return;
    }

    const context = new AudioContext();
    contextRef.current = context;
    const beatSeconds = 60 / (bpm * speed);
    const startAt = context.currentTime + 0.05;

    for (let index = 0; index < 4; index++) {
      const time = startAt + index * beatSeconds;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.frequency.value = index === 0 ? 1200 : 900;
      gain.gain.setValueAtTime(index === 0 ? 0.5 : 0.32, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      oscillator.start(time);
      oscillator.stop(time + 0.06);
    }

    setBeat(4);
    for (let index = 1; index < 4; index++) {
      timersRef.current.push(
        setTimeout(() => setBeat(4 - index), index * beatSeconds * 1000),
      );
    }
    timersRef.current.push(
      setTimeout(() => {
        setBeat(null);
        if (contextRef.current) {
          void contextRef.current.close();
          contextRef.current = null;
        }
        timersRef.current = [];
        onCompleteRef.current();
      }, 4 * beatSeconds * 1000),
    );
  }, [bpm, cancel, speed]);

  useEffect(() => cancel, [cancel]);

  return {
    beat,
    isCountingIn: beat !== null,
    start,
    cancel,
  };
}
