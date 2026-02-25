import {
  BirthFormSchema,
  reportEnvelopeSchema,
} from "@/lib/schemas/astro";
import { NatalRequestPayload } from "@/lib/types/astro";

export interface ReportEnvelope {
  payload: NatalRequestPayload;
  createdAt: number;
}

export function buildNatalRequestFromForm(
  form: BirthFormSchema,
): NatalRequestPayload {
  const [year, month, day] = form.birthDate.split("-").map(Number);
  const [hour, minute] = form.birthTime.split(":").map(Number);
  const normalizedName = form.name?.trim() ? form.name.trim() : undefined;

  return {
    name: normalizedName,
    year,
    month,
    day,
    hour,
    minute,
    city: form.citySelection.name,
    lat: form.citySelection.lat,
    lng: form.citySelection.lng,
    tz_str: form.citySelection.timezone,
    house_system: "placidus",
    zodiac_type: "tropical",
    interpretation: {
      enable: true,
      style: "improved",
    },
    include_features: ["asc", "mc", "chiron", "lilith", "true_node", "mean_node"],
    include_speed: true,
    include_dominants: true,
  };
}

function toBase64(input: string): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    return window.btoa(unescape(encodeURIComponent(input)));
  }

  return Buffer.from(input, "utf8").toString("base64");
}

function fromBase64(input: string): string {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    return decodeURIComponent(escape(window.atob(input)));
  }

  return Buffer.from(input, "base64").toString("utf8");
}

export function encodeReportEnvelope(envelope: ReportEnvelope): string {
  const payload = JSON.stringify(envelope);
  return encodeURIComponent(toBase64(payload));
}

export function decodeReportEnvelope(serialized: string): ReportEnvelope | null {
  try {
    const decoded = fromBase64(decodeURIComponent(serialized));
    const parsed = JSON.parse(decoded);
    const validation = reportEnvelopeSchema.safeParse(parsed);

    if (!validation.success) {
      return null;
    }

    return validation.data;
  } catch {
    return null;
  }
}
