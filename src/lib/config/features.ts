export function isCustomClassesEnabled(): boolean {
  const raw =
    process.env.CUSTOM_CLASSES_ENABLED ??
    process.env.NEXT_PUBLIC_CUSTOM_CLASSES_ENABLED ??
    "false";
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

