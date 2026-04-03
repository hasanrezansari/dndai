import { describe, expect, it } from "vitest";

import { getPartySecretTemplatePack } from "@/lib/party/party-templates";

describe("getPartySecretTemplatePack", () => {
  it("enables secrets for Falvos and Play Romana packs", () => {
    expect(getPartySecretTemplatePack("falvos_party_v1").enabled).toBe(true);
    expect(getPartySecretTemplatePack("playromana_party_v1").enabled).toBe(
      true,
    );
    expect(getPartySecretTemplatePack("falvos_party_v1").pool.length).toBeGreaterThan(
      0,
    );
  });

  it("disables for unknown keys", () => {
    expect(getPartySecretTemplatePack("unknown_pack").enabled).toBe(false);
  });
});
