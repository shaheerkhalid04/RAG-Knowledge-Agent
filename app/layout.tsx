import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";

import { Rail } from "@/components/rail";
import { Workspace } from "@/components/workspace";

import "./globals.css";

const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Archivist — Adaptive RAG Knowledge Agent",
  description:
    "A retrieval-augmented knowledge assistant with live document management, per-query evaluation and embedding-dimension benchmarking.",
  openGraph: {
    title: "Archivist — Adaptive RAG Knowledge Agent",
    description:
      "Ask questions grounded in your own documents. Manage the corpus live, and measure retrieval quality as it changes.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a09",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="antialiased">
        <Workspace>
          <Rail />
          <main className="relative z-10 ml-16 min-h-dvh md:ml-60">
            {children}
          </main>
        </Workspace>
      </body>
    </html>
  );
}
