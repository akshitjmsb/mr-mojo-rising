"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVocalPlayer } from "./VocalPlayer";

const TABS = [
  {
    label: "Add Song",
    href: "/",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
  {
    label: "Songs",
    href: "/practice",
    icon: (
      <>
        <path d="M3 5h12M3 10h8M3 15h5M18 17V7l3 2" />
        <circle cx="15.5" cy="17" r="2.5" />
      </>
    ),
  },
  {
    label: "Player",
    href: "/player",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4Z" />
      </>
    ),
  },
  {
    label: "Tuner",
    href: "/tuner",
    icon: (
      <>
        <path d="M8 3v7a4 4 0 0 0 8 0V3M12 14v7M9 21h6" />
      </>
    ),
  },
];

export default function TabNav() {
  const pathname = usePathname();
  const player = useVocalPlayer();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/practice") {
      return pathname.startsWith("/practice") || pathname.startsWith("/song/");
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Main navigation"
      className="grid shrink-0 grid-cols-4 border-b border-border-darkest px-4"
    >
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            title={tab.label}
            onClick={() => {
              if (tab.href === "/player" && pathname !== "/player")
                player.start();
            }}
            className={`flex min-h-12 items-center justify-center border-b transition-colors duration-300 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-gold ${
              active
                ? "border-gold text-gold"
                : "border-transparent text-text-muted"
            }`}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {tab.icon}
            </svg>
          </Link>
        );
      })}
    </nav>
  );
}
