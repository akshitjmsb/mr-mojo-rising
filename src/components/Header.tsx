import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  songTitle?: string;
  songArtist?: string;
  backHref?: string;
}

export default function Header({ songTitle, backHref }: HeaderProps) {
  return (
    <header className="shrink-0">
      <div className="flex min-h-14 items-center justify-between gap-2 px-4 py-1">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-text-muted hover:text-gold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <h1 title={songTitle || "Mr. Mojo Rising"} className="truncate font-playfair text-[20px] font-bold italic leading-tight text-text">
            {songTitle || "Mr. Mojo Rising"}
          </h1>
        </div>

        <ThemeToggle />
      </div>

    </header>
  );
}
