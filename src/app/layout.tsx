import type { Metadata, Viewport } from "next";
import {
  Playfair_Display,
  Josefin_Sans,
  Cormorant_Garamond,
  Jost,
} from "next/font/google";
import "./globals.css";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme/ThemeProvider";

// Doors theme fonts — psychedelic dive bar
const playfair = Playfair_Display({
  variable: "--font-playfair-doors",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
});

const josefin = Josefin_Sans({
  variable: "--font-josefin-doors",
  subsets: ["latin"],
  weight: ["100", "300", "400"],
});

// Eagles theme fonts — golden-hour California desert
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant-eagles",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const jost = Jost({
  variable: "--font-jost-eagles",
  subsets: ["latin"],
  weight: ["100", "300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Mr. Mojo Rising — Guitar Practice Studio",
  description:
    "Isolate guitar stems from any song. Loop sections. Practice at any speed.",
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
  const fontVariables = `${playfair.variable} ${josefin.variable} ${cormorant.variable} ${jost.variable}`;

  return (
    <html lang="en" className={fontVariables}>
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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
