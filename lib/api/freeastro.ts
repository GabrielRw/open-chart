import "server-only";

import { ZodType } from "zod";

import {
  chartSvgRequestSchema,
  geoSearchResponseSchema,
  natalRequestSchema,
  natalResponseSchema,
} from "@/lib/schemas/astro";
import { ApiProxyError, getStatusMessage } from "@/lib/errors";
import { GeoSearchResponse, NatalChartResponse, NatalRequestPayload } from "@/lib/types/astro";

const FREE_ASTRO_BASE_URL = "https://astro-api-1qnc.onrender.com/api/v1";
const REQUEST_TIMEOUT_MS = 15000;

function getApiKey(): string {
  const key = process.env.FREE_ASTRO_API_KEY;

  if (!key) {
    throw new ApiProxyError(
      500,
      "MISSING_API_KEY",
      "FREE_ASTRO_API_KEY is not configured on the server.",
    );
  }

  return key;
}

async function freeAstroFetch<T>(
  path: string,
  init: RequestInit,
  schema: ZodType<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${FREE_ASTRO_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "x-api-key": getApiKey(),
        ...(init.headers ?? {}),
      },
    });

    const raw = await response.text();
    let body: unknown = null;

    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = { raw };
      }
    }

    if (!response.ok) {
      throw new ApiProxyError(
        response.status,
        `UPSTREAM_${response.status}`,
        getStatusMessage(response.status),
        body,
      );
    }

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new ApiProxyError(
        502,
        "INVALID_UPSTREAM_RESPONSE",
        "Upstream response did not match expected schema.",
        parsed.error.flatten(),
      );
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof ApiProxyError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiProxyError(
        504,
        "UPSTREAM_TIMEOUT",
        "Upstream API timed out.",
      );
    }

    throw new ApiProxyError(
      502,
      "UPSTREAM_NETWORK_ERROR",
      "Could not reach upstream API.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchCities(params: {
  q: string;
  limit: number;
  country?: string;
}): Promise<GeoSearchResponse> {
  const query = new URLSearchParams({
    q: params.q,
    limit: String(params.limit),
  });

  if (params.country) {
    query.set("country", params.country);
  }

  return freeAstroFetch(
    `/geo/search?${query.toString()}`,
    {
      method: "GET",
    },
    geoSearchResponseSchema,
  );
}

export async function calculateNatal(
  payload: NatalRequestPayload,
): Promise<NatalChartResponse> {
  const validatedPayload = natalRequestSchema.parse(payload);

  return freeAstroFetch(
    "/natal/calculate?include_minor=true",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validatedPayload),
    },
    natalResponseSchema,
  );
}

export async function calculateChartSvg(payload: NatalRequestPayload): Promise<string> {
  const validatedPayload = chartSvgRequestSchema.parse({
    ...payload,
    name: payload.name?.trim() || "Unknown",
    format: "svg",
    size: 760,
    theme_type: "light",
    show_metadata: false,
    display_settings: {
      sun: true,
      moon: true,
      mercury: true,
      venus: true,
      mars: true,
      jupiter: true,
      saturn: true,
      uranus: true,
      neptune: true,
      pluto: true,
      asc: true,
      chiron: true,
      lilith: true,
      north_node: true,
    },
    chart_config: {
      stroke_opacity: 1,
      font_size_fraction: 0.35,
      ring_thickness_fraction: 0.15,
      sign_ring_thickness_fraction: 0.16,
      house_ring_thickness_fraction: 0.05,
      center_disk_fraction: 0.45,
      planet_symbol_scale: 0.35,
      sign_symbol_scale: 0.6,
      house_number_scale: 0.25,
      custom_planet_color: "#000000",
      custom_sign_color: null,
      custom_house_color: "#000000",
      show_color_background: false,
      sign_symbol_stroke_width: 1.5,
      sign_line_width: 2,
      sign_line_color: "black",
      house_line_width: 1,
      house_line_color: "#919191",
      sign_ring_inner_width: 1.5,
      sign_ring_inner_color: "#000000",
      sign_ring_outer_width: 2,
      sign_ring_outer_color: "#000000",
      house_ring_inner_width: 1,
      house_ring_inner_color: "#000000",
      house_ring_outer_width: 1,
      house_ring_outer_color: "#000000",
      asc_line_width: 3,
      asc_line_color: "#000000",
      dsc_line_width: 3,
      dsc_line_color: "#000000",
      mc_line_width: 3,
      mc_line_color: "#000000",
      ic_line_width: 3,
      ic_line_color: "#000000",
      sign_tick_width: 0.5,
      sign_tick_color: "#000000",
      aspect_conjunction_width: 3,
      aspect_conjunction_color: "#1A1A1A",
      aspect_opposition_width: 3,
      aspect_opposition_color: "#C00000",
      aspect_trine_width: 2.2,
      aspect_trine_color: "#0047AB",
      aspect_square_width: 2.6,
      aspect_square_color: "#C00000",
      aspect_sextile_width: 1.9,
      aspect_sextile_color: "#0047AB",
      aspect_quincunx_width: 1.7,
      aspect_quincunx_color: "#2E7D32",
      houses_inside_planets: true,
    },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${FREE_ASTRO_BASE_URL}/natal/experimental`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "x-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validatedPayload),
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new ApiProxyError(
        response.status,
        `UPSTREAM_${response.status}`,
        getStatusMessage(response.status),
        raw,
      );
    }

    if (!raw.includes("<svg")) {
      throw new ApiProxyError(
        502,
        "INVALID_CHART_SVG_RESPONSE",
        "Upstream SVG chart response is invalid.",
      );
    }

    return raw;
  } catch (error) {
    if (error instanceof ApiProxyError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiProxyError(
        504,
        "UPSTREAM_TIMEOUT",
        "Upstream API timed out.",
      );
    }

    throw new ApiProxyError(
      502,
      "UPSTREAM_NETWORK_ERROR",
      "Could not reach upstream API.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}
