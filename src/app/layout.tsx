import type { Metadata, Viewport } from "next";
import { Noto_Serif, Manrope, Inter } from "next/font/google";

import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider } from "@/components/auth/session-provider";
import { ToastContainer } from "@/components/ui/toast";

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
  title: "Ashveil — A Living World Awaits",
  description:
    "Mobile-first multiplayer AI-powered tabletop RPG. Play with friends online — AI or Human DM.",
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "https://playdndai.com",
  ),
  openGraph: {
    title: "Ashveil — A Living World Awaits",
    description:
      "Mobile-first multiplayer AI-powered tabletop RPG. Play with friends online.",
    siteName: "Ashveil",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#d4af37",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${notoSerif.variable} ${manrope.variable} ${inter.variable}`}
    >
      <body>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
          <ToastContainer />
        </AuthProvider>
      </body>
    </html>
  );
}
