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

export const metadata: Metadata = {
  title: `${getBrandName(getBuildTimeBrand())} — ${getBrandTagline(getBuildTimeBrand())}`,
  description:
    getBuildTimeBrand() === "playromana"
      ? "Curated Roman adventures. Start instantly, invite friends, and let the world respond."
      : "Play together from your phone: co-op storytelling in any genre, with an AI or human host. Sessions, heroes, and turns in one link.",
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "https://playdndai.com",
  ),
  openGraph: {
    title: `${getBrandName(getBuildTimeBrand())} — ${getBrandTagline(getBuildTimeBrand())}`,
    description:
      getBuildTimeBrand() === "playromana"
        ? "Curated Roman adventures. Start instantly, invite friends, and let the world respond."
        : "Co-op storytelling in any setting — AI or human host. Play with friends from one link.",
    siteName: getBrandName(getBuildTimeBrand()),
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#131313",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
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
