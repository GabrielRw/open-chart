import { describe, expect, it } from "vitest";

import { formatDegree, toTitleCase } from "@/lib/formatters";

describe("formatDegree", () => {
  it("formats finite numbers with degree symbol", () => {
    expect(formatDegree(12.3456)).toBe("12.35°");
  });

  it("returns fallback for invalid values", () => {
    expect(formatDegree(Number.NaN)).toBe("-");
  });
});

describe("toTitleCase", () => {
  it("converts snake_case to title case", () => {
    expect(toTitleCase("north_node")).toBe("North Node");
  });
});
