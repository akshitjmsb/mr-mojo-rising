"use client";

import { useRef, useState } from "react";
import {
  downloadFileName,
  encodeWavSelection,
  mixDecodedAudio,
} from "@/lib/audio-download";

type Props = {
  compact?: boolean;
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
  compact = false,
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
      audioContext = new AudioContext();
      const context = audioContext;
      const decodedTracks = await Promise.all(layerKey.split("|").map(async key => {
      const response = await fetch(
        `/api/songs/${songId}/download?layer=${encodeURIComponent(key)}`,
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "This piece is not available to download.");
      }

      const source = await response.arrayBuffer();
      return context.decodeAudioData(source);
      }));
      const decoded = mixDecodedAudio(decodedTracks);
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
        aria-label={preparing ? "Preparing download" : "Download selection"}
        title="Download selection"
        className="flex min-h-11 w-full items-center justify-center rounded border border-border-dark bg-transparent px-2 font-josefin text-[10px] text-text-muted disabled:opacity-55"
      >
        {compact ? (preparing ? "…" : <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>) : preparing ? "Preparing…" : "Download selection"}
      </button>
      {error ? (
        <p
          role="alert"
          className="col-span-full mt-2 font-josefin text-[10px] leading-relaxed text-terracotta"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
