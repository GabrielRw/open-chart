import { toTitleCase } from "@/lib/formatters";

export interface InterpretationItem {
  title: string;
  body: string;
  tags: string[];
}

export interface InterpretationSection {
  key: string;
  title: string;
  items: InterpretationItem[];
}

const SECTION_ORDER: Array<{ key: string; title: string }> = [
  { key: "core_self", title: "Personality & Core Self" },
  { key: "mind", title: "Mind & Emotional Patterns" },
  { key: "love_relating", title: "Love & Relationships" },
  { key: "work_path", title: "Career & Direction" },
  { key: "social_collective", title: "Social Themes" },
  { key: "karmic_healing", title: "Healing & Growth Themes" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSectionItems(value: unknown): InterpretationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const body = typeof entry.body === "string" ? entry.body.trim() : "";

      if (!body) {
        return null;
      }

      return {
        title: title || "Interpretation",
        body,
        tags: Array.isArray(entry.tags)
          ? entry.tags
              .filter((tag): tag is string => typeof tag === "string")
              .map((tag) => tag.toLowerCase())
          : [],
      };
    })
    .filter((item): item is InterpretationItem => item !== null);
}

export function organizeInterpretationSections(
  interpretation: unknown,
): InterpretationSection[] {
  if (!isRecord(interpretation)) {
    return [];
  }

  const sectionsValue = interpretation.sections;

  if (!isRecord(sectionsValue)) {
    return [];
  }

  const sections = SECTION_ORDER.map(({ key, title }) => ({
    key,
    title,
    items: parseSectionItems(sectionsValue[key]),
  })).filter((section) => section.items.length > 0);

  if (sections.length > 0) {
    return sections;
  }

  return Object.entries(sectionsValue)
    .map(([key, value]) => ({
      key,
      title: toTitleCase(key),
      items: parseSectionItems(value),
    }))
    .filter((section) => section.items.length > 0);
}
