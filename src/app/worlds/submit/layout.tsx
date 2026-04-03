import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit a world · Worlds",
  description: "Propose a story setting for the public worlds catalog (moderated).",
};

export default function WorldSubmitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
