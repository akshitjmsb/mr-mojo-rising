export const IMPORT_PROGRESS_STEPS = [
  {
    label: "In queue",
    description: "Waiting for the Mac worker",
  },
  {
    label: "Get audio",
    description: "Downloading the original recording",
  },
  {
    label: "Split tracks",
    description: "Separating guitars, vocals, bass, and drums",
  },
  {
    label: "Refine sound",
    description: "Cleaning the separated instrument layers",
  },
  {
    label: "Analyze song",
    description: "Finding song parts, notes, timing, and verified chords",
  },
  {
    label: "Ready",
    description: "Opening your song",
  },
] as const;

export interface ImportProgressStatus {
  status: string;
  processing_stage?: string | null;
  job_status?: string | null;
  preview_ready?: number | boolean;
}

/** The lesson stays closed until the durable job and song agree it is complete. */
export function isLessonReady(
  status: ImportProgressStatus | null | undefined,
) {
  return status?.status === "ready" && status.processing_stage === "complete";
}

/** Convert durable worker state into the current zero-based pipeline step. */
export function importProgressIndex(status: ImportProgressStatus) {
  if (isLessonReady(status)) return 5;

  if (
    status.processing_stage === "upload" ||
    status.processing_stage === "transcribe" ||
    status.processing_stage === "analyze" ||
    status.processing_stage === "lyrics"
  ) {
    return 4;
  }
  if (status.processing_stage === "refine") return 3;
  if (
    status.processing_stage === "separate" ||
    status.processing_stage === "preview_upload"
  ) {
    return 2;
  }
  if (status.processing_stage === "download") return 1;
  if (
    status.status === "queued" ||
    status.processing_stage === "queued" ||
    status.job_status === "queued" ||
    status.job_status === "retryable"
  ) {
    return 0;
  }

  if (status.status === "ready" || status.processing_stage === "complete") return 4;
  return status.status === "processing" ? 1 : 0;
}
