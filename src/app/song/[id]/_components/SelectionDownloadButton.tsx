"use client";

import { useRef, useState } from "react";
import {
  downloadFileName,
  encodeWavSelection,
} from "@/lib/audio-download";

type Props = {
  songId: string;
  songTitle: string;
  layerKey: string;
  pieceLabel: string;
  sectionLabel: string;
  start: number;
  end: number;
};

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function SelectionDownloadButton({
  songId,
  songTitle,
  layerKey,
  pieceLabel,
  sectionLabel,
  start,
  end,
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const activeRef = useRef(false);

  async function downloadSelection() {
    if (activeRef.current) return;
    activeRef.current = true;
    setPreparing(true);
    setError("");
    let audioContext: AudioContext | null = null;

    try {
      const response = await fetch(
        `/api/songs/${songId}/download?layer=${encodeURIComponent(layerKey)}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "This piece is not available to download.");
      }

      const source = await response.arrayBuffer();
      audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(source);
      const wav = encodeWavSelection(decoded, start, end);
      const blob = new Blob([wav], { type: "audio/wav" });
      saveBlob(blob, downloadFileName(songTitle, pieceLabel, sectionLabel));
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "The selection could not be downloaded.",
      );
    } finally {
      await audioContext?.close().catch(() => undefined);
      activeRef.current = false;
      setPreparing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={downloadSelection}
        disabled={preparing}
        className="min-h-12 rounded-[2px] border border-border-dark bg-transparent px-3 font-josefin text-[8px] uppercase tracking-[0.13em] text-text-muted disabled:opacity-55"
      >
        {preparing ? "Preparing…" : "Download selection"}
      </button>
      {error ? (
        <p
          role="alert"
          className="col-span-2 font-josefin text-[8px] leading-relaxed tracking-[0.06em] text-terracotta"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
