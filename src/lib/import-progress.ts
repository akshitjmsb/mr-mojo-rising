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
    label: "Prepare player",
    description: "Uploading the first playable version",
  },
  {
    label: "Ready",
    description: "Opening your song",
  },
] as const;

interface ImportProgressStatus {
  status: string;
  processing_stage?: string | null;
  job_status?: string | null;
  preview_ready?: number | boolean;
}

const READY_STAGES = new Set([
  "refine",
  "upload",
  "transcribe",
  "analyze",
  "lyrics",
  "complete",
]);

/** Convert durable worker state into the current zero-based pipeline step. */
export function importProgressIndex(status: ImportProgressStatus) {
  if (
    status.status === "ready" ||
    Boolean(status.preview_ready) ||
    READY_STAGES.has(status.processing_stage ?? "")
  ) {
    return 4;
  }

  if (status.processing_stage === "preview_upload") return 3;
  if (status.processing_stage === "separate") return 2;
  if (status.processing_stage === "download") return 1;
  if (
    status.status === "queued" ||
    status.processing_stage === "queued" ||
    status.job_status === "queued" ||
    status.job_status === "retryable"
  ) {
    return 0;
  }

  return status.status === "processing" ? 1 : 0;
}
