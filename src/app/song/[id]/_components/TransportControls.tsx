"use client";

interface Props {
  isPlaying: boolean;
  isLooping: boolean;
  metronomeOn: boolean;
  bpm: number | null;
  speed: number;
  togglePlay: () => void;
  toggleLoop: () => void;
  toggleMetronome: () => void;
  rewind: () => void;
  forward: () => void;
  seekStepSeconds: number;
}

export default function TransportControls({
  isPlaying,
  isLooping,
  metronomeOn,
  bpm,
  speed,
  togglePlay,
  toggleLoop,
  toggleMetronome,
  rewind,
  forward,
  seekStepSeconds,
}: Props) {
  return (
    <div className="flex items-center justify-center gap-[18px] px-5 pt-1.5 pb-3.5">
      <button
        onClick={toggleLoop}
        className={`flex cursor-pointer items-center border-none bg-transparent p-2.5 ${
          isLooping ? "text-gold" : "text-text-muted"
        }`}
        aria-label={isLooping ? "Disable loop" : "Enable loop"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 014-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 01-4 4H3" />
        </svg>
      </button>

      {bpm && (
        <button
          onClick={toggleMetronome}
          title={
            metronomeOn
              ? `Metronome on — ${bpm} BPM`
              : `Metronome off — ${bpm} BPM`
          }
          className={`flex cursor-pointer flex-col items-center gap-[1px] border-none bg-transparent p-2.5 ${
            metronomeOn ? "text-gold" : "text-text-muted"
          }`}
        >
          <svg
            width="16"
            height="18"
            viewBox="0 0 16 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <polygon points="8,1 15,17 1,17" strokeLinejoin="round" />
            <line x1="8" y1="17" x2="8" y2="6" />
            <circle
              cx={metronomeOn ? "10.5" : "5.5"}
              cy="10"
              r="1.2"
              fill="currentColor"
              stroke="none"
            >
              {metronomeOn && (
                <animate
                  attributeName="cx"
                  values="5.5;10.5;5.5"
                  dur={`${(60 / (bpm * speed)) * 2}s`}
                  repeatCount="indefinite"
                />
              )}
            </circle>
          </svg>
          <span className="font-josefin text-[8px] tracking-[0.04em]">
            {Math.round(bpm)}
          </span>
        </button>
      )}

      <button
        onClick={rewind}
        title={`Rewind ${seekStepSeconds}s`}
        aria-label={`Rewind ${seekStepSeconds} seconds`}
        className="flex cursor-pointer items-center border-none bg-transparent p-2.5 text-text-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
        </svg>
      </button>

      <button
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="relative flex h-[58px] w-[58px] cursor-pointer items-center justify-center rounded-full border-[1.5px] border-gold bg-transparent text-gold"
      >
        <div className="absolute inset-1 rounded-full bg-gold/10" />
        {isPlaying ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="relative z-10"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg
            width="18"
            height="20"
            viewBox="0 0 18 20"
            fill="currentColor"
            className="relative z-10 ml-0.5"
          >
            <path d="M0 0L18 10L0 20V0Z" />
          </svg>
        )}
      </button>

      <button
        onClick={forward}
        title={`Forward ${seekStepSeconds}s`}
        aria-label={`Forward ${seekStepSeconds} seconds`}
        className="flex cursor-pointer items-center border-none bg-transparent p-2.5 text-text-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 6h2v12h-2V6zm-1.5 6L6 6v12l8.5-6z" />
        </svg>
      </button>
    </div>
  );
}
