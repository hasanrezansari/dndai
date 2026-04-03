import { isCustomClassesEnabled } from "@/lib/config/features";
import { CLASSES } from "@/lib/rules/character";
import { ClassProfileSchema } from "@/lib/schemas/domain";

/**
 * Player-facing class label + mechanical key for icons / fallbacks.
 */
export function resolveCharacterDisplayFields(params: {
  classColumn: string;
  visualProfile: Record<string, unknown>;
}): { displayClass: string; mechanicalClass: string } {
  const vp = params.visualProfile;
  const mechRaw =
    typeof vp.mechanical_class === "string"
      ? vp.mechanical_class.trim().toLowerCase()
      : "";
  const classCol = params.classColumn.trim().toLowerCase();
  const mechanicalClass = mechRaw || classCol;

  if (isCustomClassesEnabled()) {
    const parsed = ClassProfileSchema.safeParse(vp.class_profile);
    if (parsed.success) {
      return {
        displayClass: parsed.data.display_name.trim() || prettifySlug(classCol),
        mechanicalClass,
      };
    }
  }

  const preset = CLASSES.find((x) => x.value === mechanicalClass);
  if (preset) {
    return { displayClass: preset.label, mechanicalClass };
  }

  return {
    displayClass: prettifySlug(params.classColumn.trim()) || params.classColumn,
    mechanicalClass,
  };
}

function prettifySlug(s: string): string {
  if (!s.trim()) return "";
  return s
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
