import type { MetadataRoute } from "next";

import { getBrandName, getBuildTimeBrand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  const brand = getBuildTimeBrand();
  const isRomana = brand === "playromana";
  return {
    name: getBrandName(brand),
    short_name: getBrandName(brand),
    description: isRomana
      ? "Curated Roman adventures — play instantly with friends."
      : "Multiplayer AI storytelling — any genre, your table, one link.",
    start_url: "/",
    display: "standalone",
    background_color: isRomana ? "#0A0A0A" : "#0c0a14",
    theme_color: isRomana ? "#D4AF37" : "#e8a84a",
  };
}
