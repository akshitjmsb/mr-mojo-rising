interface SpinnerProps {
  size?: number;
  className?: string;
  stroke?: string;
}

export default function Spinner({
  size = 24,
  className = "",
  stroke = "var(--color-gold)",
}: SpinnerProps) {
  return (
    <svg
      className={`spinning ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}
