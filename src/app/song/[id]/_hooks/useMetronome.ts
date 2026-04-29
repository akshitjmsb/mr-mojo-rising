"use client";

import { useEffect, useRef } from "react";

interface Options {
  enabled: boolean;
  bpm: number | null | undefined;
  speed: number;
}

/**
 * Web-Audio metronome with a 200ms scheduler look-ahead so beats stay precise
 * regardless of main-thread jank. Adjusts beat interval to playback speed and
 * accents the downbeat (every 4 beats) at a higher pitch.
 */
export function useMetronome({ enabled, bpm, speed }: Options) {
  const ref = useRef<{
    ctx: AudioContext;
    nextBeatTime: number;
    beatInterval: number;
    timerId: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !bpm) {
      if (ref.current) {
        if (ref.current.timerId !== null) clearTimeout(ref.current.timerId);
        ref.current.ctx.close();
        ref.current = null;
      }
      return;
    }

    const ctx = new AudioContext();
    const beatInterval = 60 / (bpm * speed);
    ref.current = {
      ctx,
      nextBeatTime: ctx.currentTime + 0.1,
      beatInterval,
      timerId: null,
    };

    function scheduleClick(time: number, accent: boolean) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = accent ? 1200 : 900;
      gain.gain.setValueAtTime(accent ? 0.5 : 0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      osc.start(time);
      osc.stop(time + 0.05);
    }

    let beatCount = 0;
    const LOOKAHEAD_MS = 100;
    const SCHEDULE_AHEAD = 0.2;

    function tick() {
      const m = ref.current;
      if (!m) return;
      while (m.nextBeatTime < m.ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleClick(m.nextBeatTime, beatCount % 4 === 0);
        beatCount++;
        m.nextBeatTime += m.beatInterval;
      }
      m.timerId = setTimeout(tick, LOOKAHEAD_MS);
    }

    tick();

    return () => {
      if (ref.current) {
        if (ref.current.timerId !== null) clearTimeout(ref.current.timerId);
        ref.current.ctx.close();
        ref.current = null;
      }
    };
  }, [enabled, bpm, speed]);
}
