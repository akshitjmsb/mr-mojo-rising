import {
  IMPORT_PROGRESS_STEPS,
  importProgressIndex,
  type ImportProgressStatus,
} from "@/lib/import-progress";

export default function SongProcessingProgress({
  status,
  detail,
}: {
  status: ImportProgressStatus | null;
  detail: string;
}) {
  const currentIndex = importProgressIndex(
    status ?? { status: "queued", processing_stage: "queued" },
  );
  const current = IMPORT_PROGRESS_STEPS[currentIndex];

  return (
    <section
      aria-label="Song processing progress"
      className="w-full max-w-[310px] border-y border-border-dark py-4 text-left"
    >
      <p
        aria-live="polite"
        className="mb-4 font-josefin text-[9px] uppercase tracking-[0.18em] text-gold"
      >
        Step {currentIndex + 1} of {IMPORT_PROGRESS_STEPS.length} · {current.label}
      </p>
      <ol>
        {IMPORT_PROGRESS_STEPS.map((step, index) => {
          const complete = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li
              key={step.label}
              aria-current={active ? "step" : undefined}
              className="grid grid-cols-[22px_1fr] gap-3"
            >
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border font-josefin text-[8px] ${
                    complete
                      ? "border-gold bg-gold text-bg"
                      : active
                        ? "border-gold text-gold"
                        : "border-border-dark text-text-darkest"
                  }`}
                >
                  {complete ? "✓" : index + 1}
                </span>
                {index < IMPORT_PROGRESS_STEPS.length - 1 ? (
                  <span
                    className={`h-5 w-px ${complete ? "bg-gold" : "bg-border-dark"}`}
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="pb-3">
                <p
                  className={`font-josefin text-[10px] uppercase tracking-[0.12em] ${
                    complete || active ? "text-text" : "text-text-darkest"
                  }`}
                >
                  {step.label}
                </p>
                {active ? (
                  <p className="mt-1 font-josefin text-[9px] leading-relaxed tracking-[0.04em] text-text-muted">
                    {step.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 font-josefin text-[9px] leading-relaxed tracking-[0.05em] text-text-muted">
        {detail}
      </p>
    </section>
  );
}
