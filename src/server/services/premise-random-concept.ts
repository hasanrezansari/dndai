/**
 * Builds a short concept string for AI class generation from table premise (character lobby).
 * Keeps within generate-class API limits (max 180 chars).
 */
export function buildPremiseRandomConcept(params: {
  adventure_prompt: string | null;
  adventure_tags: string[] | null;
  world_bible: string | null;
}): string {
  const bits: string[] = [
    "One original PC who fits this table — avoid stock labels unless the premise implies them.",
  ];
  const p = params.adventure_prompt?.trim();
  if (p) bits.push(`Pitch: ${p.slice(0, 120)}`);
  const tags = params.adventure_tags?.filter(Boolean) ?? [];
  if (tags.length > 0) bits.push(`Tags: ${tags.slice(0, 6).join(", ")}`);
  const wb = params.world_bible?.trim();
  if (wb) bits.push(`Canon: ${wb.slice(0, 80)}${wb.length > 80 ? "…" : ""}`);
  const raw = bits.join(" ");
  return raw.length <= 180 ? raw : `${raw.slice(0, 177)}…`;
}
