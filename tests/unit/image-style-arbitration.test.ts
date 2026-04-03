import { describe, expect, it } from "vitest";

import { buildArbitratedStyleDirectives } from "@/lib/orchestrator/image-worker";

describe("image style arbitration", () => {
  it("enforces deterministic priority order", () => {
    const result = buildArbitratedStyleDirectives({
      sessionThemeStyle: "cyberpunk concept art, neon edge lighting",
      classVisualTags: ["Chrome Edges", "neon rain", "chrome edges"],
      classConcepts: ["Blade Dancer", "augmented ronin", "blade dancer"],
      turnHint: {
        environment: "Rainy market bridge",
        mood: "urgent tension",
      },
    });

    expect(result.orderedStyleDirectives[0]).toContain("Session theme (highest priority)");
    expect(result.orderedStyleDirectives[1]).toBe(
      "Class visual tags (secondary): chrome edges, neon rain",
    );
    expect(result.orderedStyleDirectives[2]).toBe(
      "Class concepts (secondary): augmented ronin, blade dancer",
    );
    expect(result.orderedStyleDirectives[3]).toBe(
      "Turn hint details (tertiary): rainy market bridge, urgent tension",
    );
  });

  it("omits empty lower-priority directives while preserving order", () => {
    const result = buildArbitratedStyleDirectives({
      sessionThemeStyle: "painted adventure illustration, cinematic lighting",
      classVisualTags: [],
      classConcepts: [],
    });

    expect(result.orderedStyleDirectives).toEqual([
      "Session theme (highest priority): painted adventure illustration, cinematic lighting",
    ]);
    expect(result.policyLine).toContain("session theme has final authority");
  });
});

