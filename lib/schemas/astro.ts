import { z } from "zod";

const upstreamCitySchema = z
  .object({
    name: z.string().min(1),
    country_code: z.string().optional(),
    country: z.string().optional(),
    lat: z.number(),
    lng: z.number(),
    timezone: z.string().min(1),
    population: z.number().optional(),
  })
  .transform((city) => ({
    name: city.name,
    country_code: city.country_code ?? city.country ?? "",
    lat: city.lat,
    lng: city.lng,
    timezone: city.timezone,
    population: city.population,
  }));

export const geoSearchResponseSchema = z
  .object({
    results: z.array(upstreamCitySchema),
    count: z.number().int().nonnegative().optional(),
  })
  .transform((value) => ({
    results: value.results,
    count: value.count ?? value.results.length,
  }));

export const geoSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((val) => val.toUpperCase())
    .optional(),
});

export const natalRequestSchema = z.object({
  name: z.string().trim().max(120).optional(),
  year: z.number().int().min(1800).max(2100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  city: z.string().trim().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  tz_str: z.string().trim().min(1),
  house_system: z.literal("placidus"),
  zodiac_type: z.literal("tropical"),
  interpretation: z.object({
    enable: z.literal(true),
    style: z.literal("improved"),
    language: z.literal("en").optional(),
  }),
  include_features: z.array(
    z.enum(["asc", "mc", "chiron", "lilith", "true_node", "mean_node"]),
  ).min(2),
  include_speed: z.literal(true),
  include_dominants: z.literal(true),
});

export const chartSvgRequestSchema = natalRequestSchema.extend({
  format: z.literal("svg").default("svg"),
  size: z.number().int().min(400).max(1200).default(760),
  theme_type: z.enum(["light", "dark", "mono"]).default("mono"),
  show_metadata: z.boolean().default(false),
  display_settings: z
    .object({
      chiron: z.boolean().optional(),
      lilith: z.boolean().optional(),
      north_node: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  chart_config: z
    .object({
      show_color_background: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});

const subjectSchema = z.object({
  name: z.string().optional(),
  datetime: z.string(),
  location: z.object({
    city: z.string(),
    lat: z.number(),
    lng: z.number(),
    timezone: z.string(),
  }),
  settings: z
    .object({
      house_system: z.string(),
      zodiac_type: z.string(),
      julian_day: z.number().optional(),
      julian_day_tt: z.number().optional(),
      delta_t_days: z.number().optional(),
      delta_t_seconds: z.number().optional(),
    })
    .passthrough(),
});

const planetSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sign: z.string(),
    sign_id: z.string().optional(),
    pos: z.number(),
    abs_pos: z.number(),
    house: z.number(),
    retrograde: z.boolean(),
    speed: z.number().optional(),
    is_stationary: z.boolean().optional(),
    variant: z.string().optional(),
  })
  .passthrough();

const houseSchema = z.object({
  house: z.number(),
  name: z.string(),
  sign: z.string(),
  sign_id: z.string(),
  pos: z.number(),
  abs_pos: z.number(),
});

const angleDetailSchema = z.object({
  sign: z.string(),
  sign_id: z.string(),
  pos: z.number(),
  abs_pos: z.number(),
  house: z.number(),
});

const aspectSchema = z.object({
  p1: z.string(),
  p2: z.string(),
  type: z.string(),
  orb: z.number(),
  deg: z.number(),
  is_major: z.boolean(),
});

const aspectsSummarySchema = z.object({
  total: z.number().int(),
  major: z.number().int(),
  minor: z.number().int(),
  by_type: z.record(z.string(), z.number()),
});

export const natalResponseSchema = z
  .object({
    subject: subjectSchema,
    planets: z.array(planetSchema),
    houses: z.array(houseSchema),
    angles: z.object({
      asc: z.number(),
      mc: z.number(),
      ic: z.number(),
      dc: z.number(),
      vertex: z.number().optional(),
    }),
    angles_details: z.record(z.string(), angleDetailSchema.optional()),
    aspects: z.array(aspectSchema),
    aspects_summary: aspectsSummarySchema,
    interpretation: z.unknown().optional(),
    dominants: z.unknown().optional(),
  })
  .passthrough();

export const birthFormSchema = z.object({
  name: z.string().trim().max(120).optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format for date"),
  birthTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use HH:mm format for time"),
  citySelection: z.object({
    name: z.string(),
    country_code: z.string(),
    lat: z.number(),
    lng: z.number(),
    timezone: z.string(),
    population: z.number().optional(),
  }),
});

export const reportEnvelopeSchema = z.object({
  createdAt: z.number().int().positive(),
  payload: natalRequestSchema,
});

export type GeoSearchResponseSchema = z.infer<typeof geoSearchResponseSchema>;
export type NatalRequestSchema = z.infer<typeof natalRequestSchema>;
export type NatalResponseSchema = z.infer<typeof natalResponseSchema>;
export type BirthFormSchema = z.infer<typeof birthFormSchema>;
export type ReportEnvelopeSchema = z.infer<typeof reportEnvelopeSchema>;
