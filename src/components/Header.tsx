import Link from "next/link";

interface HeaderProps {
  songTitle?: string;
  songArtist?: string;
  backHref?: string;
}

export default function Header({ songTitle, songArtist, backHref }: HeaderProps) {
  return (
    <header>
      <div className="flex items-start justify-between gap-3 pt-[22px] pr-5 pl-5">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[1px] border border-border-dark text-text-muted transition-colors hover:text-gold hover:border-gold"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </Link>
        )}

        <div className="flex-1">
          <h1 className="flicker font-playfair text-[26px] font-black italic leading-none tracking-[-0.01em] text-text">
            Mr. Mojo Rising
          </h1>
          <p className="mt-1.5 font-josefin text-[9px] font-thin uppercase tracking-[0.28em] text-gold">
            Guitar Practice Studio
          </p>
        </div>

        <div className="text-right">
          {songTitle ? (
            <>
              <p className="font-playfair text-[13px] italic text-text-secondary">
                {songTitle}
              </p>
              {songArtist && (
                <p className="mt-0.5 font-josefin text-[9px] font-thin uppercase tracking-[0.18em] text-text-muted">
                  {songArtist}
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex items-center px-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border-dark" />
        <div className="mx-2 h-1 w-1 rotate-45 bg-gold opacity-60" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border-dark" />
      </div>
    </header>
  );
}
