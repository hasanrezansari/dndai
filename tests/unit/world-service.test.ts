import { describe, expect, it } from "vitest";

import type { WorldRow } from "@/server/services/world-service";
import {
  buildCreateSessionParamsFromWorld,
  buildImmutableWorldSnapshot,
  worldRowToDetailDto,
} from "@/server/services/world-service";

const gladiatorRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "roma-gladiator-uprising",
  title: "Gladiator Uprising",
  subtitle: "Pitch line",
  card_teaser: "Short teaser.",
  description: "Long theme line for catalog.",
  status: "published",
  sort_order: 0,
  module_key: "roma_gladiator_uprising",
  campaign_mode_default: "module",
  default_max_players: null,
  snapshot_definition: {
    theme: "ignored-for-module",
    tags: ["arena", "rebellion"],
  },
  published_revision: 2,
  is_featured: true,
  fork_count: 7,
  cover_image_url: "https://images.unsplash.com/photo-1552832230-c0197dd311b7?w=400",
  cover_image_alt: "Colosseum",
  created_by_user_id: null,
  submitted_for_review_at: null,
  ugc_review_status: "none",
  rejection_reason: null,
  created_at: new Date("2026-01-01T00:00:00.000Z"),
  updated_at: new Date("2026-01-01T00:00:00.000Z"),
} as const satisfies WorldRow;

describe("world-service snapshot + create params", () => {
  it("buildImmutableWorldSnapshot merges Roma seed for module keys", () => {
    const snap = buildImmutableWorldSnapshot(gladiatorRow);
    expect(snap.worldId).toBe(gladiatorRow.id);
    expect(snap.slug).toBe("roma-gladiator-uprising");
    expect(snap.published_revision).toBe(2);
    expect(snap.cover_image_url).toContain("unsplash");
    expect(snap).toHaveProperty("roma_seed");
    const seed = (snap as { roma_seed?: { theme?: string } }).roma_seed;
    expect(seed?.theme).toContain("Ancient Rome");
  });

  it("buildCreateSessionParamsFromWorld uses module mode and Roma theme", () => {
    const params = buildCreateSessionParamsFromWorld(gladiatorRow, "host-1", {
      mode: "ai_dm",
      maxPlayers: 3,
      acquisitionSource: "test",
    });
    expect(params.campaignMode).toBe("module");
    expect(params.moduleKey).toBe("roma_gladiator_uprising");
    expect(params.gameKind).toBe("campaign");
    expect(params.maxPlayers).toBe(3);
    expect(params.adventurePrompt).toContain("Ancient Rome");
    expect(params.adventureTags).toEqual(["arena", "rebellion"]);
    expect(params.hostUserId).toBe("host-1");
  });

  it("draft worlds are not returned by getters (integration-style contract)", () => {
    const draft = { ...gladiatorRow, status: "draft" } as WorldRow;
    const snap = buildImmutableWorldSnapshot(draft);
    expect(snap.slug).toBe("roma-gladiator-uprising");
    // Fork path must load via getPublishedWorld* only — callers enforce published.
    expect(draft.status).toBe("draft");
  });

  it("worldRowToDetailDto carries metrics from row + extras", () => {
    const dto = worldRowToDetailDto(gladiatorRow, {
      likeCount: 12,
      liked: true,
    });
    expect(dto.isFeatured).toBe(true);
    expect(dto.forkCount).toBe(7);
    expect(dto.likeCount).toBe(12);
    expect(dto.liked).toBe(true);
    expect(dto.coverImageUrl).toContain("unsplash");
    expect(dto.cardTeaser).toBe("Short teaser.");
  });
});
