const SPEEDS: Array<{ label: string; value: number }> = [
  { label: "50%", value: 0.5 },
  { label: "60%", value: 0.6 },
  { label: "70%", value: 0.7 },
  { label: "80%", value: 0.8 },
  { label: "90%", value: 0.9 },
  { label: "Full", value: 1.0 },
];

interface Props {
  value: number;
  onChange: (value: number) => void;
}

export default function SpeedPresets({ value, onChange }: Props) {
  return (
    <div className="flex gap-1.5 px-5 pb-3.5">
      {SPEEDS.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            className={`cursor-pointer rounded-[1px] border bg-transparent px-3 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.12em] transition-colors duration-300 ${
              active
                ? "border-gold text-gold"
                : "border-border-dark text-text-dark"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
