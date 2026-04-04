import type { Metadata, Viewport } from "next";
import { Noto_Serif, Manrope, Inter } from "next/font/google";

import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider } from "@/components/auth/session-provider";
import { ToastContainer } from "@/components/ui/toast";
import { getBrandName, getBrandTagline, getBuildTimeBrand } from "@/lib/brand";

import "./globals.css";

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
  weight: ["400", "700"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const metaBrand = getBuildTimeBrand();

export const metadata: Metadata = {
  title: `${getBrandName(metaBrand)} — ${getBrandTagline(metaBrand)}`,
  description:
    metaBrand === "playromana"
      ? "Curated Roman adventures. Start instantly, invite friends, and let the world respond."
      : "WhatIfPlay — multiplayer storytelling in any genre. AI or human narrator, shared heroes, turns, and scene art in one link.",
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "https://playdndai.com",
  ),
  openGraph: {
    title: `${getBrandName(metaBrand)} — ${getBrandTagline(metaBrand)}`,
    description:
      metaBrand === "playromana"
        ? "Curated Roman adventures. Start instantly, invite friends, and let the world respond."
        : "Co-op storytelling in any setting — AI or human narrator. Play with friends from one link.",
    siteName: getBrandName(metaBrand),
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: metaBrand === "playromana" ? "#131313" : "#0c0a14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const skin = metaBrand === "playromana" ? "playromana" : "whatifplay";
  return (
    <html
      lang="en"
      data-app-skin={skin}
      className={`dark ${notoSerif.variable} ${manrope.variable} ${inter.variable}`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
          <ToastContainer />
        </AuthProvider>
      </body>
    </html>
  );
}
