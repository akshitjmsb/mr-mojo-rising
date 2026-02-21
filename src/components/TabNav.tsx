"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Import", href: "/" },
  { label: "Library", href: "/library" },
  { label: "Practice", href: "/practice" },
];

export default function TabNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      style={{
        display: "flex",
        gap: 28,
        padding: "0 20px",
        borderBottom: "1px solid var(--color-border-darkest)",
      }}
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          style={{
            fontFamily: "var(--font-josefin), sans-serif",
            fontSize: 10,
            fontWeight: 300,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: isActive(tab.href) ? "var(--color-gold)" : "var(--color-text-muted)",
            borderBottom: isActive(tab.href) ? "1px solid var(--color-gold)" : "1px solid transparent",
            padding: "12px 0",
            textDecoration: "none",
            transition: "color 0.25s, border-color 0.25s",
          }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
