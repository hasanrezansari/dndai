import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Publish from play · Worlds",
  description:
    "How to submit a campaign as a moderated story-world template after you play.",
};

export default function WorldSubmitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
