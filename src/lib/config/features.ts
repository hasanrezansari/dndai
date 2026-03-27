export function isCustomClassesEnabled(): boolean {
  const raw =
    process.env.CUSTOM_CLASSES_ENABLED ??
    process.env.NEXT_PUBLIC_CUSTOM_CLASSES_ENABLED ??
    "true";
  const normalized = raw.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

