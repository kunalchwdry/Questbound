import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cinzel, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { MotionPreferences } from "@/components/ui/MotionPreferences";

const display = Cinzel({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Questbound — Turn your life into an RPG",
    template: "%s · Questbound",
  },
  description:
    "Questbound is a Life RPG: turn real-world tasks into quests, earn XP and gold, level six attributes, keep streaks alive with shields, and spend your loot in the Armory.",
  applicationName: "Questbound",
  keywords: [
    "life rpg",
    "gamified habit tracker",
    "gamified to-do list",
    "productivity game",
    "habit rpg",
    "quest tracker",
    "streaks",
    "xp",
  ],
  authors: [{ name: "Questbound" }],
  category: "productivity",
  openGraph: {
    type: "website",
    siteName: "Questbound",
    title: "Questbound — Turn your life into an RPG",
    description:
      "Every task is a quest. Every day is a chapter. Earn XP, level your attributes and build streaks that feel like victories.",
    url: siteUrl,
    images: [{ url: "/images/hero.jpg", width: 1536, height: 1024, alt: "A glowing guild ledger" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Questbound — Turn your life into an RPG",
    description:
      "A Life RPG that makes mundane checkmarks feel like loot drops.",
    images: ["/images/hero.jpg"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d0b15",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:font-bold focus:text-gold-ink"
        >
          Skip to content
        </a>
        <MotionPreferences>{children}</MotionPreferences>
      </body>
    </html>
  );
}
