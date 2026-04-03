/**
 * Lobby + session payloads: prefer hero name, then a non-generic account name,
 * then email local-part (fixes rows where `users.name` is still default "Adventurer").
 */
export function resolvePlayerDisplayName(params: {
  characterName: string | null | undefined;
  userName: string | null | undefined;
  userEmail: string | null | undefined;
}): string | null {
  const char = params.characterName?.trim();
  if (char) return char;

  const rawName = params.userName?.trim() ?? "";
  const email = params.userEmail?.trim() ?? "";
  const isGuestEmail =
    email.length > 0 && email.toLowerCase().endsWith("@ashveil.guest");
  const emailLocal =
    email && !isGuestEmail ? email.split("@")[0]?.trim() || "" : "";

  if (rawName && !/^adventurer$/i.test(rawName)) {
    return rawName;
  }

  if (emailLocal) {
    return emailLocal;
  }

  if (rawName) {
    return rawName;
  }

  if (isGuestEmail) {
    const m = email.match(/^guest-([^@]+)@/i);
    const idPart = m?.[1]?.trim();
    if (idPart) {
      const short = idPart.replace(/-/g, "").slice(0, 6);
      return short ? `Guest ${short}` : "Guest";
    }
    return "Guest";
  }

  return null;
}
