"use client";
import { useEffect } from "react";
import { claimChunkReload, isChunkLoadError } from "@/lib/chunk-recovery";

export default function LoadError({ error, reset, title }: { error: Error; reset: () => void; title: string }) {
  const stalePage = isChunkLoadError(error);
  useEffect(() => {
    console.error(error);
    if (!stalePage) return;
    const recover = () => {
      if (!navigator.onLine) return;
      try {
        if (claimChunkReload(window.sessionStorage)) window.location.reload();
      } catch { /* Manual refresh remains available in restricted browsers. */ }
    };
    recover();
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, [error, stalePage]);
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
    <p className="font-playfair text-[20px] italic text-gold">{stalePage ? "Let’s refresh Mojo." : title}</p>
    <p className="font-josefin text-[12px] tracking-[0.06em] text-text-muted">
      {stalePage ? "A page file could not load. Check your connection and refresh. Your songs are safe." : "This page could not load. Please try again."}
    </p>
    <button onClick={() => stalePage ? window.location.reload() : reset()} className="min-h-11 cursor-pointer border border-gold bg-transparent px-5 py-2.5 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold">
      {stalePage ? "Refresh app" : "Try again"}
    </button>
    <a href="/practice" className="py-3 font-josefin text-[12px] text-text-muted">Back to songs</a>
  </div>;
}
