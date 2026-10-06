import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme/ThemeProvider";
import { VocalPlayerProvider } from "@/components/VocalPlayer";
import NotificationBadge from "@/components/NotificationBadge";

// Bundle theme fonts locally so production builds do not download from Google.
// Doors theme fonts — psychedelic dive bar
const playfair = localFont({
  src: "./fonts/PlayfairDisplay.ttf",
  variable: "--font-playfair-doors",
  weight: "400 900",
  display: "swap",
});

const josefin = localFont({
  src: "./fonts/JosefinSans.ttf",
  variable: "--font-josefin-doors",
  weight: "100 700",
  display: "swap",
});

// Dylan theme fonts — typewriter ink on yellowed paper
const specialElite = localFont({
  src: "./fonts/SpecialElite.ttf",
  variable: "--font-special-elite-dylan",
  weight: "400",
  display: "swap",
});

const ibmPlexSans = localFont({
  src: "./fonts/IBM-Plex-Sans.ttf",
  variable: "--font-ibm-plex-dylan",
  weight: "300 500",
  display: "swap",
});

// Ali theme fonts — warm monsoon evening, Sufi acoustic warmth
const lora = localFont({
  src: "./fonts/Lora.ttf",
  variable: "--font-lora-ali",
  weight: "400 700",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/DMSans.ttf",
  variable: "--font-dm-sans-ali",
  weight: "100 1000",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mr. Mojo Rising — Guitar Learning System",
  description:
    "Organize separated audio, lyrics, chords, and guitar notes on one accurate synchronized song map.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mr. Mojo Rising",
  },
};

export const viewport: Viewport = {
  // Doors default; ThemeProvider rewrites this meta on hydration so the
  // browser/PWA chrome reflects the active theme.
  themeColor: "#0A0806",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Font CSS variables MUST live on <html> (not <body>) — the theme tokens
  // resolve at :root, so a body-scoped variable would be invisible to them.
  const fontVariables = `${playfair.variable} ${josefin.variable} ${specialElite.variable} ${ibmPlexSans.variable} ${lora.variable} ${dmSans.variable}`;

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/*
         * Stamp the persisted theme onto <html data-theme="..."> before first
         * paint so themed CSS variables resolve on the first frame (no flash).
         */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="antialiased">
        <NotificationBadge />
        <ThemeProvider><VocalPlayerProvider>{children}</VocalPlayerProvider></ThemeProvider>
      </body>
    </html>
  );
}
