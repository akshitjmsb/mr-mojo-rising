import type { ReactNode } from "react";

/**
 * 420px-wide single-column shell used by every route. Sits above the global
 * noise/glow layers (z-1) and stretches to viewport height so the footer pins
 * to the bottom on short pages.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell relative z-[1] mx-auto flex min-h-0 w-full max-w-[480px] flex-1 flex-col overflow-hidden">
      {children}
    </div>
  );
}
