export type AppBrand = "falvos" | "playromana";

export function getBuildTimeBrand(): AppBrand {
  const raw = (process.env.NEXT_PUBLIC_BRAND ?? "").trim().toLowerCase();
  if (raw === "playromana") return "playromana";
  return "falvos";
}

export function getBrandName(brand: AppBrand): string {
  switch (brand) {
    case "playromana":
      return "PlayRomana";
    case "falvos":
    default:
      return "WhatIfPlay";
  }
}

export function getBrandTagline(brand: AppBrand): string {
  switch (brand) {
    case "playromana":
      return "Curated Roman adventures — play instantly with friends.";
    case "falvos":
    default:
      return "Play any story you can imagine — your table, one link.";
  }
}

