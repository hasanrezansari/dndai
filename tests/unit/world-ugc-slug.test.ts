import { describe, expect, it } from "vitest";

import { slugBaseFromTitle } from "@/server/services/world-ugc-service";

describe("slugBaseFromTitle", () => {
  it("slugifies ASCII titles", () => {
    expect(slugBaseFromTitle("My Cool Setting!")).toBe("my-cool-setting");
  });

  it("strips diacritics", () => {
    expect(slugBaseFromTitle("Café Noir")).toBe("cafe-noir");
  });

  it("falls back when empty", () => {
    expect(slugBaseFromTitle("!!!")).toBe("world");
  });
});
