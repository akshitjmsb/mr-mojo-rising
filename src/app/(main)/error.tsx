"use client";

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MainError({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-playfair text-[20px] italic text-gold">
        Something broke on through.
      </p>
      <p className="font-josefin text-[12px] tracking-[0.06em] text-text-muted">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="cursor-pointer border border-gold bg-transparent px-5 py-2.5 font-josefin text-[10px] uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold/5"
      >
        Try again
      </button>
    </div>
  );
}
