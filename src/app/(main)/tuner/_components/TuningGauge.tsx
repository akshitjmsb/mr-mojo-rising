"use client";

interface Props {
  cents: number | null;
  inTune: boolean;
}

const GAUGE_RANGE = 50;

const GAUGE_TICKS = Array.from({ length: 11 }, (_, index) => {
  const value = -50 + index * 10;
  const tickAngle = (value / GAUGE_RANGE) * 60;
  const radians = ((tickAngle - 90) * Math.PI) / 180;
  const inner = value % 25 === 0 ? 70 : 76;
  const x1 = Number((100 + inner * Math.cos(radians)).toFixed(2));
  const y1 = Number((95 + inner * Math.sin(radians)).toFixed(2));
  const x2 = Number((100 + 84 * Math.cos(radians)).toFixed(2));
  const y2 = Number((95 + 84 * Math.sin(radians)).toFixed(2));

  return (
    <line
      key={value}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={
        value === 0 ? "var(--color-gold)" : "var(--color-border-dark)"
      }
      strokeWidth={value === 0 ? 1.5 : 0.7}
    />
  );
});

export default function TuningGauge({ cents, inTune }: Props) {
  const clamped = Math.max(
    -GAUGE_RANGE,
    Math.min(GAUGE_RANGE, cents ?? 0),
  );
  const angle = (clamped / GAUGE_RANGE) * 60;

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 200 110" className="block w-full" aria-hidden>
        <path
          d="M 16 95 A 84 84 0 0 1 184 95"
          fill="none"
          stroke="var(--color-border-darkest)"
          strokeWidth="1"
        />
        {GAUGE_TICKS}
        <circle cx="100" cy="95" r="3" fill="var(--color-border)" />
        <line
          x1="100"
          y1="95"
          x2="100"
          y2="22"
          stroke={inTune ? "var(--color-gold)" : "var(--color-orange)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          transform={`rotate(${angle.toFixed(2)} 100 95)`}
          style={{
            transition: "transform 100ms ease-out, stroke 160ms ease",
            transformOrigin: "100px 95px",
          }}
        />
        <text x="20" y="108" fill="var(--color-text-darkest)" fontSize="7" fontFamily="var(--font-josefin)" letterSpacing="0.15em" textAnchor="middle">
          FLAT
        </text>
        <text x="100" y="108" fill="var(--color-text-muted)" fontSize="7" fontFamily="var(--font-josefin)" letterSpacing="0.2em" textAnchor="middle">
          IN TUNE
        </text>
        <text x="180" y="108" fill="var(--color-text-darkest)" fontSize="7" fontFamily="var(--font-josefin)" letterSpacing="0.15em" textAnchor="middle">
          SHARP
        </text>
      </svg>
    </div>
  );
}
