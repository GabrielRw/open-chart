import { describe, expect, it } from "vitest";

import { geoSearchResponseSchema, natalResponseSchema } from "@/lib/schemas/astro";

describe("geoSearchResponseSchema", () => {
  it("normalizes country to country_code", () => {
    const parsed = geoSearchResponseSchema.parse({
      results: [
        {
          name: "Paris",
          country: "FR",
          lat: 48.85341,
          lng: 2.3488,
          timezone: "Europe/Paris",
        },
      ],
    });

    expect(parsed.results[0].country_code).toBe("FR");
    expect(parsed.count).toBe(1);
  });
});

describe("natalResponseSchema", () => {
  it("accepts the minimum natal response contract", () => {
    const parsed = natalResponseSchema.safeParse({
      subject: {
        datetime: "1990-5-15 14:30",
        location: {
          city: "Paris",
          lat: 48.85341,
          lng: 2.3488,
          timezone: "Europe/Paris",
        },
        settings: {
          house_system: "placidus",
          zodiac_type: "Tropical",
        },
      },
      planets: [
        {
          id: "sun",
          name: "Sun",
          sign: "Tau",
          sign_id: "taurus",
          pos: 24.4,
          abs_pos: 54.4,
          house: 9,
          retrograde: false,
        },
      ],
      houses: [
        {
          house: 1,
          name: "1",
          sign: "Can",
          sign_id: "cancer",
          pos: 19.6,
          abs_pos: 109.6,
        },
      ],
      angles: {
        asc: 109.6,
        mc: 353.6,
        ic: 173.6,
        dc: 289.6,
      },
      angles_details: {
        asc: {
          sign: "Can",
          sign_id: "cancer",
          pos: 19.6,
          abs_pos: 109.6,
          house: 1,
        },
      },
      aspects: [
        {
          p1: "sun",
          p2: "moon",
          type: "trine",
          orb: 2.11,
          deg: 120,
          is_major: true,
        },
      ],
      aspects_summary: {
        total: 1,
        major: 1,
        minor: 0,
        by_type: {
          trine: 1,
        },
      },
    });

    expect(parsed.success).toBe(true);
  });
});
