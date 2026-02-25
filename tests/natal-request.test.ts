import { describe, expect, it } from "vitest";

import { buildNatalRequestFromForm } from "@/lib/natal-request";

describe("buildNatalRequestFromForm", () => {
  it("maps form values to natal request payload", () => {
    const payload = buildNatalRequestFromForm({
      name: "Albert Einstein",
      birthDate: "1879-03-14",
      birthTime: "11:30",
      citySelection: {
        name: "Ulm",
        country_code: "DE",
        lat: 48.4011,
        lng: 9.9876,
        timezone: "Europe/Berlin",
      },
    });

    expect(payload).toMatchObject({
      name: "Albert Einstein",
      year: 1879,
      month: 3,
      day: 14,
      hour: 11,
      minute: 30,
      city: "Ulm",
      lat: 48.4011,
      lng: 9.9876,
      tz_str: "Europe/Berlin",
      house_system: "placidus",
      zodiac_type: "tropical",
      include_features: ["asc", "mc", "chiron", "lilith", "true_node", "mean_node"],
      include_speed: true,
      include_dominants: true,
    });
  });
});
