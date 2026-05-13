"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Worker = {
  worker_id: string;
  status: string;
  current_job_id: string | null;
  current_song_id: string | null;
  started_at: number;
  heartbeat_at: number;
  updated_at: number;
  heartbeat_age_seconds: number;
  is_online: number;
};

type WorkerPayload = {
  status: "online" | "offline";
  online_count: number;
  latest_worker: Worker | null;
  workers: Worker[];
  queue: {
    queued: number;
    running: number;
    retryable: number;
    failed: number;
    has_waiting_work: boolean;
  };
  last_command: {
    command: string;
    status: string;
    requested_at: number;
    handled_at: number | null;
    message: string | null;
  } | null;
};

function formatAge(seconds: number | null | undefined) {
  if (seconds == null) return "Never";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function WorkerPage() {
  const [payload, setPayload] = useState<WorkerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchWorker = useCallback(async () => {
    const res = await fetch("/api/worker", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch worker");
    setPayload(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchWorker();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch worker");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWorker]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchWorker().catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchWorker]);

  async function restartWorker() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "restart" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayload(data.payload ?? payload);
        setError(data.error || "Failed to restart worker");
        return;
      }
      setPayload(data);
    } catch {
      setError("Failed to restart worker");
    } finally {
      setBusy(false);
    }
  }

  const latest = payload?.latest_worker ?? null;
  const isOnline = payload?.status === "online";
  const headline = useMemo(() => {
    if (loading) return "Checking";
    if (isOnline) return "Online";
    return payload?.queue.has_waiting_work ? "Offline With Queue" : "Offline";
  }, [isOnline, loading, payload?.queue.has_waiting_work]);

  return (
    <main className="flex-1 px-5 py-5">
      <section className="border-b border-border-darkest pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-text-muted">
              Mac Worker
            </p>
            <h1 className="mt-2 font-playfair text-[30px] italic leading-none text-text">
              {headline}
            </h1>
          </div>
          <div
            className={`mt-1 h-3 w-3 rounded-full ${
              isOnline ? "bg-gold" : "bg-terracotta"
            }`}
            aria-label={isOnline ? "Worker online" : "Worker offline"}
          />
        </div>

        {error && (
          <p className="mt-4 font-josefin text-[11px] leading-[1.5] tracking-[0.08em] text-terracotta">
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-border-darkest bg-border-darkest">
          <Metric label="Heartbeat" value={formatAge(latest?.heartbeat_age_seconds)} />
          <Metric label="Queue" value={`${payload?.queue.queued ?? 0}`} />
          <Metric label="Running" value={`${payload?.queue.running ?? 0}`} />
          <Metric label="Retry" value={`${payload?.queue.retryable ?? 0}`} />
        </div>

        <button
          onClick={restartWorker}
          disabled={!isOnline || busy}
          className="mt-5 h-11 w-full border border-gold bg-transparent font-josefin text-[10px] uppercase tracking-[0.18em] text-gold transition-colors duration-200 enabled:cursor-pointer enabled:hover:bg-gold/10 disabled:cursor-default disabled:opacity-40"
        >
          {busy ? "Requesting..." : "Restart Worker"}
        </button>
      </section>

      <section className="py-5">
        <p className="font-josefin text-[9px] uppercase tracking-[0.2em] text-text-muted">
          Last Worker
        </p>
        <div className="mt-3 space-y-2 font-josefin text-[11px] uppercase tracking-[0.12em] text-text-secondary">
          <Info label="ID" value={latest?.worker_id ?? "None"} />
          <Info label="State" value={latest?.status ?? "Unknown"} />
          <Info label="Current Job" value={latest?.current_job_id ?? "None"} />
          <Info
            label="Last Command"
            value={
              payload?.last_command
                ? `${payload.last_command.command} ${payload.last_command.status}`
                : "None"
            }
          />
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg p-3">
      <p className="font-josefin text-[8px] uppercase tracking-[0.18em] text-text-dark">
        {label}
      </p>
      <p className="mt-1 font-playfair text-[18px] italic text-text">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-darkest py-2">
      <span className="text-text-dark">{label}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right">
        {value}
      </span>
    </div>
  );
}
