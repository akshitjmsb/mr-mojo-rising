export type StemMode = "guitar" | "vocals" | "full";

const MODES: Array<{ key: StemMode; label: string }> = [
  { key: "guitar", label: "Guitar Stem" },
  { key: "vocals", label: "Vocal Stem" },
  { key: "full", label: "Full Mix" },
];

interface Props {
  value: StemMode;
  onChange: (mode: StemMode) => void;
}

export default function StemSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 px-5 pt-4">
      {MODES.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`cursor-pointer rounded-[1px] border px-3.5 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.18em] transition-colors duration-300 ${
              active
                ? "border-gold bg-gold/5 text-gold"
                : "border-border bg-transparent text-text-dark"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
