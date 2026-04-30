"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Import", href: "/" },
  { label: "Library", href: "/library" },
  { label: "Last Played", href: "/practice" },
  { label: "Tuner", href: "/tuner" },
];

export default function TabNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex gap-7 border-b border-border-darkest px-5">
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`block border-b py-3 font-josefin text-[10px] font-light uppercase tracking-[0.2em] transition-colors duration-300 ${
              active
                ? "border-gold text-gold"
                : "border-transparent text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
