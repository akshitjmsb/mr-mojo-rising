"use client";

interface Props {
  loopStart: number;
  loopEnd: number;
  bpm: number | null;
  speed: number;
  completedLoops: number;
  repetitionsPerStep: number;
  bestPracticeSpeed: number;
  countInEnabled: boolean;
  autoRampEnabled: boolean;
  onSetStart: () => void;
  onSetEnd: () => void;
  onResetRange: () => void;
  onToggleCountIn: () => void;
  onToggleAutoRamp: () => void;
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = (safe % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${remainder}`;
}

export default function PhraseTrainer({
  loopStart,
  loopEnd,
  bpm,
  speed,
  completedLoops,
  repetitionsPerStep,
  bestPracticeSpeed,
  countInEnabled,
  autoRampEnabled,
  onSetStart,
  onSetEnd,
  onResetRange,
  onToggleCountIn,
  onToggleAutoRamp,
}: Props) {
  const stepProgress = completedLoops % repetitionsPerStep;
  const phraseDuration = Math.max(0, loopEnd - loopStart);

  return (
    <section className="mx-5 mb-3 rounded-[2px] border border-border-dark bg-gold/[0.025] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-gold">
            Phrase Trainer
          </p>
          <p className="mt-1 font-josefin text-[9px] font-thin tracking-[0.08em] text-text-muted">
            A {formatTime(loopStart)} · B {formatTime(loopEnd)} · {formatTime(phraseDuration)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-playfair text-[17px] italic text-text">
            {stepProgress}/{repetitionsPerStep}
          </p>
          <p className="font-josefin text-[8px] uppercase tracking-[0.12em] text-text-dark">
            loops at {Math.round(speed * 100)}%
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={onSetStart}
          className="min-h-8 cursor-pointer rounded-[1px] border border-border bg-transparent px-2 font-josefin text-[9px] uppercase tracking-[0.12em] text-text-muted"
        >
          Set A
        </button>
        <button
          onClick={onSetEnd}
          className="min-h-8 cursor-pointer rounded-[1px] border border-border bg-transparent px-2 font-josefin text-[9px] uppercase tracking-[0.12em] text-text-muted"
        >
          Set B
        </button>
        <button
          onClick={onResetRange}
          className="min-h-8 cursor-pointer rounded-[1px] border border-border bg-transparent px-2 font-josefin text-[9px] uppercase tracking-[0.12em] text-text-muted"
        >
          Section
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={onToggleCountIn}
          disabled={!bpm}
          aria-pressed={countInEnabled}
          className={`min-h-8 cursor-pointer rounded-[1px] border px-2 font-josefin text-[9px] uppercase tracking-[0.12em] disabled:cursor-default disabled:opacity-40 ${
            countInEnabled
              ? "border-gold bg-gold/5 text-gold"
              : "border-border bg-transparent text-text-muted"
          }`}
        >
          4-beat count-in
        </button>
        <button
          onClick={onToggleAutoRamp}
          aria-pressed={autoRampEnabled}
          className={`min-h-8 cursor-pointer rounded-[1px] border px-2 font-josefin text-[9px] uppercase tracking-[0.12em] ${
            autoRampEnabled
              ? "border-gold bg-gold/5 text-gold"
              : "border-border bg-transparent text-text-muted"
          }`}
        >
          +5% every {repetitionsPerStep}
        </button>
      </div>

      {bestPracticeSpeed > 0 && (
        <p className="mt-2 text-center font-josefin text-[8px] uppercase tracking-[0.12em] text-text-dark">
          Top practiced speed · {Math.round(bestPracticeSpeed * 100)}%
        </p>
      )}
    </section>
  );
}
