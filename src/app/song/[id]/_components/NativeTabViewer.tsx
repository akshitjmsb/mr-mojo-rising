"use client";

import { useEffect, useRef, useState } from "react";

type StoredScore = {
  songId: string;
  fileName: string;
  bytes: ArrayBuffer;
  updatedAt: number;
};

type ScoreTrack = {
  index: number;
  name: string;
};

interface Props {
  songId: string;
}

const DATABASE_NAME = "mr-mojo-private-scores";
const STORE_NAME = "scores";
const DATABASE_VERSION = 1;

function openScoreDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "songId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredScore(songId: string) {
  const database = await openScoreDatabase();
  try {
    return await new Promise<StoredScore | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(songId);
      request.onsuccess = () =>
        resolve((request.result as StoredScore | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function writeStoredScore(score: StoredScore) {
  const database = await openScoreDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(score);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function deleteStoredScore(songId: string) {
  const database = await openScoreDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(songId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export default function NativeTabViewer({ songId }: Props) {
  const rendererRef = useRef<HTMLDivElement | null>(null);
  const [score, setScore] = useState<StoredScore | null>(null);
  const [tracks, setTracks] = useState<ScoreTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [status, setStatus] = useState<
    "empty" | "loading" | "ready" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void readStoredScore(songId).then(
      (stored) => {
        if (cancelled) return;
        setScore(stored);
        setStatus(stored ? "loading" : "empty");
      },
      () => {
        if (!cancelled) setStatus("empty");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [songId]);

  useEffect(() => {
    const element = rendererRef.current;
    if (!score || !element) return;

    let cancelled = false;
    let api: import("@coderline/alphatab").AlphaTabApi | null = null;
    setStatus("loading");
    setErrorMessage("");
    element.replaceChildren();

    void import("@coderline/alphatab").then(
      (alphaTab) => {
        if (cancelled) return;
        try {
          const parsed = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
            new Uint8Array(score.bytes),
          );
          const nextTracks = parsed.tracks.map((track, index) => ({
            index,
            name: track.name.trim() || `Track ${index + 1}`,
          }));
          setTracks(nextTracks);
          const safeTrack = Math.min(
            selectedTrack,
            Math.max(0, nextTracks.length - 1),
          );
          if (safeTrack !== selectedTrack) setSelectedTrack(safeTrack);

          const settings = new alphaTab.Settings();
          settings.core.engine = "svg";
          settings.core.useWorkers = false;
          settings.core.fontDirectory = "/alphatab/font/";
          settings.display.layoutMode = alphaTab.LayoutMode.Horizontal;
          settings.display.scale = 0.72;
          settings.player.enablePlayer = false;

          api = new alphaTab.AlphaTabApi(element, settings);
          api.error.on((error) => {
            if (cancelled) return;
            setErrorMessage(
              error instanceof Error ? error.message : "This score could not be rendered.",
            );
            setStatus("error");
          });
          api.postRenderFinished.on(() => {
            if (!cancelled) setStatus("ready");
          });
          if (!api.load(score.bytes.slice(0), [safeTrack])) {
            throw new Error("Unsupported score format.");
          }
        } catch (error) {
          if (cancelled) return;
          setErrorMessage(
            error instanceof Error ? error.message : "This score could not be opened.",
          );
          setStatus("error");
        }
      },
      () => {
        if (cancelled) return;
        setErrorMessage("The native tab renderer could not be loaded.");
        setStatus("error");
      },
    );

    return () => {
      cancelled = true;
      api?.destroy();
      element.replaceChildren();
    };
  }, [score, selectedTrack]);

  async function importScore(file: File | undefined) {
    if (!file) return;
    setStatus("loading");
    setErrorMessage("");
    try {
      const nextScore: StoredScore = {
        songId,
        fileName: file.name,
        bytes: await file.arrayBuffer(),
        updatedAt: Date.now(),
      };
      // Parsing is intentionally performed before persistence, so a corrupt or
      // unsupported file never replaces the learner's working score.
      const alphaTab = await import("@coderline/alphatab");
      alphaTab.importer.ScoreLoader.loadScoreFromBytes(
        new Uint8Array(nextScore.bytes),
      );
      await writeStoredScore(nextScore);
      setSelectedTrack(0);
      setScore(nextScore);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "This score could not be opened.",
      );
      setStatus("error");
    }
  }

  async function removeScore() {
    await deleteStoredScore(songId);
    setScore(null);
    setTracks([]);
    setSelectedTrack(0);
    setStatus("empty");
    setErrorMessage("");
    rendererRef.current?.replaceChildren();
  }

  return (
    <div className="mt-4 border-t border-border-dark pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-josefin text-[8px] uppercase tracking-[0.14em] text-gold">
            Notation truth gate
          </p>
          <p className="mt-1 font-josefin text-[9px] leading-relaxed text-text-muted">
            {score
              ? "Private score · source preserved · not uploaded"
              : "AI frets withheld · audio remains available"}
          </p>
        </div>
        {score && (
          <button
            type="button"
            onClick={() => void removeScore()}
            className="min-h-8 shrink-0 cursor-pointer font-josefin text-[7px] uppercase tracking-[0.1em] text-text-dark"
          >
            Remove
          </button>
        )}
      </div>

      {!score && status !== "loading" && (
        <div className="mt-3 rounded-[2px] border border-border-dark bg-bg/35 p-3">
          <p className="font-playfair text-[17px] italic text-text">
            No guessed frets
          </p>
          <p className="mt-1 font-josefin text-[9px] leading-relaxed text-text-muted">
            The detected pitches do not have enough independent evidence to teach as truth.
          </p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-[2px] border border-gold/60 bg-gold/[0.06] px-4 font-josefin text-[8px] uppercase tracking-[0.13em] text-gold">
            Open a private score
            <input
              type="file"
              accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp6,.gp7,.musicxml,.mxl,.xml"
              className="sr-only"
              onChange={(event) => {
                void importScore(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="mt-2 text-center font-josefin text-[7px] uppercase tracking-[0.08em] text-text-darkest">
            Guitar Pro or MusicXML · stays on this device
          </p>
        </div>
      )}

      {score && (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[2px] border border-border-dark px-3 py-2">
            <p className="min-w-0 truncate font-josefin text-[8px] text-text-muted">
              {score.fileName}
            </p>
            {tracks.length > 1 && (
              <select
                value={selectedTrack}
                onChange={(event) => setSelectedTrack(Number(event.target.value))}
                aria-label="Score track"
                className="min-h-8 max-w-[55%] rounded-[2px] border border-border bg-bg px-2 font-josefin text-[8px] text-gold"
              >
                {tracks.map((track) => (
                  <option key={track.index} value={track.index}>
                    {track.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-3 overflow-x-auto rounded-[2px] border border-border-dark bg-[#f4efe4] [scrollbar-width:thin]">
            <div
              ref={rendererRef}
              className="min-h-40 min-w-[720px] py-2"
              aria-label="Native guitar tablature"
            />
          </div>
          <p className="mt-2 font-josefin text-[7px] uppercase tracking-[0.08em] text-text-darkest">
            Native left-to-right score · select the guitar track above
          </p>
        </>
      )}

      {status === "loading" && (
        <p className="mt-3 text-center font-josefin text-[8px] uppercase tracking-[0.1em] text-text-dark">
          Opening score…
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="mt-3 font-josefin text-[8px] leading-relaxed text-terracotta">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
