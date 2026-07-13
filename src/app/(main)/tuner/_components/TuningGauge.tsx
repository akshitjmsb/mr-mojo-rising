"use client";

import { useEffect, useRef } from "react";

interface Props {
  cents: number | null;
  inTune: boolean;
}

const GAUGE_RANGE = 50;

/**
 * Half-circle needle gauge. Smooths the needle with a low-pass on the cents
 * value so noisy YIN frames don't make the needle judder.
 */
export default function TuningGauge({ cents, inTune }: Props) {
  const targetRef = useRef<number | null>(cents);
  const smoothedRef = useRef<number>(0);
  const needleRef = useRef<SVGLineElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = cents;
  }, [cents]);

  useEffect(() => {
    function tick() {
      const target = targetRef.current;
      if (target === null) {
        // Drift the needle back to center when there's no signal.
        smoothedRef.current = smoothedRef.current * 0.85;
      } else {
        const clamped = Math.max(-GAUGE_RANGE, Math.min(GAUGE_RANGE, target));
        smoothedRef.current = smoothedRef.current * 0.7 + clamped * 0.3;
      }
      const angle = (smoothedRef.current / GAUGE_RANGE) * 60;
      if (needleRef.current) {
        needleRef.current.setAttribute(
          "transform",
          `rotate(${angle.toFixed(2)} 100 95)`,
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Tick marks every 10 cents from -50 to +50. Coordinates are rounded so
  // server and client serialize identically (raw trig floats differ in the
  // last digit between Node and the browser → hydration mismatch).
  const ticks = [];
  for (let c = -50; c <= 50; c += 10) {
    const angle = (c / GAUGE_RANGE) * 60;
    const rad = ((angle - 90) * Math.PI) / 180;
    const inner = c % 25 === 0 ? 70 : 76;
    const x1 = Number((100 + inner * Math.cos(rad)).toFixed(2));
    const y1 = Number((95 + inner * Math.sin(rad)).toFixed(2));
    const x2 = Number((100 + 84 * Math.cos(rad)).toFixed(2));
    const y2 = Number((95 + 84 * Math.sin(rad)).toFixed(2));
    ticks.push(
      <line
        key={c}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={c === 0 ? "var(--color-gold)" : "var(--color-border-dark)"}
        strokeWidth={c === 0 ? 1.5 : 0.7}
      />,
    );
  }

  const needleColor = inTune ? "var(--color-gold)" : "var(--color-orange)";

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 200 110"
        className="block w-full"
        aria-hidden
      >
        {/* outer arc */}
        <path
          d="M 16 95 A 84 84 0 0 1 184 95"
          fill="none"
          stroke="var(--color-border-darkest)"
          strokeWidth="1"
        />
        {ticks}
        {/* center pivot */}
        <circle cx="100" cy="95" r="3" fill="var(--color-border)" />
        <line
          ref={needleRef}
          x1="100"
          y1="95"
          x2="100"
          y2="22"
          stroke={needleColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{
            transition: "stroke 200ms ease",
            transformOrigin: "100px 95px",
          }}
        />
        {/* labels */}
        <text
          x="20"
          y="108"
          fill="var(--color-text-darkest)"
          fontSize="7"
          fontFamily="var(--font-josefin)"
          letterSpacing="0.15em"
          textAnchor="middle"
        >
          FLAT
        </text>
        <text
          x="100"
          y="108"
          fill="var(--color-text-muted)"
          fontSize="7"
          fontFamily="var(--font-josefin)"
          letterSpacing="0.2em"
          textAnchor="middle"
        >
          IN TUNE
        </text>
        <text
          x="180"
          y="108"
          fill="var(--color-text-darkest)"
          fontSize="7"
          fontFamily="var(--font-josefin)"
          letterSpacing="0.15em"
          textAnchor="middle"
        >
          SHARP
        </text>
      </svg>
    </div>
  );
}
