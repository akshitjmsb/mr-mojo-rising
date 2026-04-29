"use client";

import { useRef, useState } from "react";
import type { Database } from "@/lib/database.types";

type Stem = Database["public"]["Tables"]["stems"]["Row"];

export type DownloadStemKey = "full" | "guitar" | "vocals" | "drums" | "bass";

interface Props {
  songId: string;
  stems: Stem | null;
  songTitle: string | null;
  currentStem: DownloadStemKey;
}

const ITEMS: Array<{ key: DownloadStemKey; label: string; column: keyof Stem }> = [
  { key: "full", label: "Full Mix", column: "original_url" },
  { key: "guitar", label: "Guitar", column: "guitar_url" },
  { key: "vocals", label: "Vocals", column: "vocals_url" },
  { key: "drums", label: "Drums", column: "drums_url" },
  { key: "bass", label: "Bass", column: "bass_url" },
];

function DownloadIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function defaultFileName(title: string | null, stem: DownloadStemKey): string {
  const slug =
    (title || "song")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "song";
  return `${slug}-${stem}.wav`;
}

function fileNameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // fall through
    }
  }
  const quoted = disposition.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const unquoted = disposition.match(/filename=([^;]+)/i);
  if (unquoted?.[1]) return unquoted[1].trim();
  return null;
}

export default function DownloadPanel({
  songId,
  stems,
  songTitle,
  currentStem,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DownloadStemKey | null>(null);
  const [error, setError] = useState("");
  const lockRef = useRef(false);

  async function downloadStem(stem: DownloadStemKey) {
    if (lockRef.current) return;
    lockRef.current = true;
    setError("");
    setBusy(stem);
    try {
      const res = await fetch(`/api/songs/${songId}/download?stem=${stem}`);
      if (!res.ok) {
        let msg = "Failed to download file";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") msg = data.error;
        } catch {
          // keep default
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const fileName =
        fileNameFromDisposition(res.headers.get("content-disposition")) ||
        defaultFileName(songTitle, stem);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download file");
    } finally {
      setBusy(null);
      lockRef.current = false;
    }
  }

  return (
    <>
      <div className="px-5 pt-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-[1px] border px-3.5 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.18em] transition-colors duration-300 ${
            open
              ? "border-gold bg-gold/5 text-gold"
              : "border-border bg-transparent text-text-dark"
          }`}
        >
          <span>Download</span>
          <DownloadIcon />
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-5 pt-2">
          {ITEMS.map((item) => {
            const available = Boolean(stems?.[item.column]);
            const disabled = !available || busy !== null;
            return (
              <button
                key={item.key}
                onClick={() => downloadStem(item.key)}
                disabled={disabled}
                className={`flex min-w-[92px] items-center justify-between gap-2 rounded-[1px] border px-2.5 py-1.5 font-josefin text-[9px] font-light uppercase tracking-[0.12em] transition-opacity ${
                  item.key === currentStem
                    ? "border-gold"
                    : "border-border-dark"
                } ${
                  available
                    ? "cursor-pointer text-text-dark"
                    : "cursor-default text-text-darkest"
                } disabled:cursor-default disabled:opacity-45`}
              >
                <span>{item.label}</span>
                <DownloadIcon
                  color={available ? "currentColor" : "var(--color-text-darkest)"}
                />
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <p className="px-5 pt-2 font-josefin text-[10px] tracking-[0.08em] text-terracotta">
          {error}
        </p>
      )}
    </>
  );
}
