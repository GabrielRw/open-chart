"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { getAspectGlyph, getBodyGlyph, getSignGlyph } from "@/lib/astro-font";
import { formatDegree, formatPlanetKey, toTitleCase } from "@/lib/formatters";
import { organizeInterpretationSections } from "@/lib/interpretation";
import { NatalAspect, NatalChartResponse, NatalPlanet } from "@/lib/types/astro";

interface ReportViewProps {
  data: NatalChartResponse;
  chartSvg: string | null;
}

interface AspectStrength {
  label: string;
  score: number;
}

interface InterpretationAtom {
  key: string;
  category: string;
  title: string;
  body: string;
}

interface AspectModalState {
  aspect: NatalAspect;
  interpretation: InterpretationAtom | null;
}

interface HoverPlanetState {
  kind: "planet" | "sign" | "house";
  token: string;
  x: number;
  y: number;
}

interface SelectedAspectEndpoints {
  p1: string;
  p2: string;
}

interface StoredHighlight {
  id: string;
  start: number;
  end: number;
  color: string;
}

interface HighlightMenuState {
  x: number;
  y: number;
  start: number;
  end: number;
}

interface ExportSectionOption {
  id: string;
  label: string;
}

type AspectPhase = "Applying" | "Separating" | "Unknown";

interface DominantsSummary {
  fire: number;
  earth: number;
  air: number;
  water: number;
}

const PLANET_ORDER = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "north_node",
  "lilith",
  "chiron",
];

const PLANET_MEANINGS: Record<string, string> = {
  sun: "Self, individuality, personality",
  moon: "Emotions, instincts, roots",
  mercury: "Thinking, communication, intellect",
  venus: "Love, harmony, values",
  mars: "Activity, energy, courage",
  jupiter: "Happiness, optimism, expansion",
  saturn: "Restriction, order, maturity",
  uranus: "Originality, freedom, revolution",
  neptune: "Fantasy, illusion, spirituality",
  pluto: "Transformation, regeneration, power",
  north_node: "Growth direction, life path",
  lilith: "Fascination and denial",
  chiron: "Wounded healer, inner teacher",
};

const PLANET_OVERVIEW: Record<string, string> = {
  sun: "The Sun reflects core identity, vitality, and the drive to become fully oneself.",
  moon: "The Moon describes emotional needs, instinctive reactions, and inner security patterns.",
  mercury: "Mercury shows how the mind perceives, learns, and communicates.",
  venus: "Venus indicates relationship style, values, attraction, and harmony.",
  mars: "Mars represents action, assertion, desire, and the way energy is directed.",
  jupiter: "Jupiter expands perspective, beliefs, and pathways to growth and meaning.",
  saturn: "Saturn defines responsibility, structure, discipline, and long-term mastery.",
  uranus: "Uranus marks originality, disruption, awakening, and the need for freedom.",
  neptune: "Neptune symbolizes imagination, sensitivity, ideals, and subtle inner perception.",
  pluto: "Pluto points to deep transformation, power dynamics, and regenerative change.",
  north_node: "The North Node highlights life direction, growth edges, and developmental themes.",
  lilith: "Lilith reveals instinctive shadow material, autonomy themes, and denied desires.",
  chiron: "Chiron marks core wounds and the path toward integration and healing wisdom.",
};

const RULERS: Record<string, string> = {
  Ari: "Mars",
  Tau: "Venus",
  Gem: "Mercury",
  Can: "Moon",
  Leo: "Sun",
  Vir: "Mercury",
  Lib: "Venus",
  Sco: "Pluto",
  Sag: "Jupiter",
  Cap: "Saturn",
  Aqu: "Uranus",
  Pis: "Neptune",
};

function parseInterpretationAtoms(interpretation: unknown): InterpretationAtom[] {
  if (!interpretation || typeof interpretation !== "object" || Array.isArray(interpretation)) {
    return [];
  }

  const sections = (interpretation as { sections?: unknown }).sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
    return [];
  }

  const atoms: InterpretationAtom[] = [];

  for (const entries of Object.values(sections as Record<string, unknown>)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const rec = entry as Record<string, unknown>;
      const title = typeof rec.title === "string" ? rec.title.trim() : "";
      const body = typeof rec.body === "string" ? rec.body.trim() : "";
      const category = typeof rec.category === "string" ? rec.category : "";
      const key = typeof rec.key === "string" ? rec.key : "";

      if (!title || !body) {
        continue;
      }

      atoms.push({ key, category, title, body });
    }
  }

  return atoms;
}

function getAspectStrength(orb: number): AspectStrength {
  const score = Math.max(5, Math.min(100, Math.round(100 - orb * 10)));

  if (orb <= 1.5) return { label: "Very strong", score };
  if (orb <= 3) return { label: "Strong", score };
  if (orb <= 5) return { label: "Moderate", score };
  if (orb <= 7) return { label: "Subtle", score };
  return { label: "Faint", score };
}

function sortAspects(aspects: NatalAspect[]) {
  return [...aspects].sort((a, b) => a.orb - b.orb);
}

function dedupeAspects(aspects: NatalAspect[]) {
  const bestByKey = new Map<string, NatalAspect>();

  for (const aspect of aspects) {
    const left = aspect.p1.toLowerCase();
    const right = aspect.p2.toLowerCase();

    // Drop self aspects (typically mean/true node cross-artifacts like north_node-north_node).
    if (left === right) {
      continue;
    }

    const [a, b] = [left, right].sort();
    const key = `${a}|${b}|${aspect.type.toLowerCase()}|${aspect.deg}`;
    const current = bestByKey.get(key);

    if (!current || aspect.orb < current.orb) {
      bestByKey.set(key, aspect);
    }
  }

  return Array.from(bestByKey.values());
}

function normalizeSigned180(value: number): number {
  let v = value % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}

function aspectOrbFromDelta(delta: number, aspectDeg: number): number {
  if (aspectDeg === 0) {
    return Math.abs(normalizeSigned180(delta));
  }

  const diffA = Math.abs(normalizeSigned180(delta - aspectDeg));
  const diffB = Math.abs(normalizeSigned180(delta + aspectDeg));
  return Math.min(diffA, diffB);
}

function normalizedDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

const MAJOR_ANGLE_ASPECTS: Array<{ type: NatalAspect["type"]; deg: number; maxOrb: number }> = [
  { type: "conjunction", deg: 0, maxOrb: 6 },
  { type: "sextile", deg: 60, maxOrb: 4.5 },
  { type: "square", deg: 90, maxOrb: 6 },
  { type: "trine", deg: 120, maxOrb: 6 },
  { type: "opposition", deg: 180, maxOrb: 6 },
];

function deriveAngleAspects(
  angleKey: "asc" | "mc",
  angleAbsPos: number | undefined,
  planets: NatalPlanet[],
): NatalAspect[] {
  if (typeof angleAbsPos !== "number") {
    return [];
  }

  const result: NatalAspect[] = [];

  for (const planet of planets) {
    const distance = normalizedDistance(angleAbsPos, planet.abs_pos);

    for (const candidate of MAJOR_ANGLE_ASPECTS) {
      const orb = Math.abs(distance - candidate.deg);
      if (orb <= candidate.maxOrb) {
        result.push({
          p1: angleKey,
          p2: planet.id,
          type: candidate.type,
          orb: Number(orb.toFixed(2)),
          deg: candidate.deg,
          is_major: true,
        });
      }
    }
  }

  return sortAspects(result);
}

function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function getPlanetByName(planets: NatalPlanet[], name: string) {
  return planets.find((p) => p.name.toLowerCase() === name.toLowerCase());
}

function getAtomBody(
  atoms: InterpretationAtom[],
  planet: NatalPlanet | undefined,
  category: "planet_sign" | "planet_house",
): string | null {
  if (!planet) {
    return null;
  }

  const atom = atoms.find((a) => {
    if (a.category !== category) {
      return false;
    }

    if (category === "planet_sign") {
      return (
        a.key.includes(`planet.${planet.id}.sign`) ||
        a.title.toLowerCase().startsWith(`${planet.name.toLowerCase()} in `)
      );
    }

    return (
      a.key.includes(`planet.${planet.id}.house`) ||
      a.title.toLowerCase().startsWith(`${planet.name.toLowerCase()} in house`)
    );
  });

  return atom?.body ?? null;
}

function getAngleInterpretationAtoms(
  atoms: InterpretationAtom[],
  angle: "ascendant" | "midheaven",
): InterpretationAtom[] {
  const titlePrefix = angle === "ascendant" ? "ascendant" : "midheaven";

  return atoms.filter((atom) => {
    if (atom.category !== "planet_sign" && atom.category !== "planet_house") {
      return false;
    }

    return (
      atom.key.includes(`planet.${angle}.`) ||
      atom.title.toLowerCase().startsWith(titlePrefix)
    );
  });
}

function buildAngleNarrative(params: {
  angleLabel: "Ascendant" | "MC";
  sign: string;
  rulerName?: string;
  rulerPlanet?: NatalPlanet;
}): string {
  const { angleLabel, sign, rulerName, rulerPlanet } = params;
  const angleScope =
    angleLabel === "Ascendant"
      ? "first impression, physical presence, and instinctive style of engagement"
      : "career path, public image, and visible social role";

  if (!rulerPlanet || !rulerName) {
    return `${angleLabel} in ${sign} frames ${angleScope}. This sign sets the outer tone of expression and how momentum builds in this life area.`;
  }

  return `${angleLabel} in ${sign} frames ${angleScope}. Its ruler ${rulerName} is in ${rulerPlanet.sign} in the ${ordinal(rulerPlanet.house)} house, so ${angleLabel.toLowerCase()} themes are filtered through ${ordinal(rulerPlanet.house)}-house priorities and ${rulerPlanet.sign} style.`;
}

function Glyph({ char, className = "" }: { char: string; className?: string }) {
  if (!char) return null;
  return <span className={`astro-glyph ${className}`}>{char}</span>;
}

function planetAspects(aspects: NatalAspect[], planetId: string) {
  const majorTypes = new Set(["conjunction", "sextile", "square", "trine", "opposition"]);
  const isMajor = (aspect: NatalAspect) => majorTypes.has(aspect.type.toLowerCase()) || aspect.is_major;

  return aspects
    .filter((aspect) => aspect.p1 === planetId || aspect.p2 === planetId)
    .sort((a, b) => {
      const aMajor = isMajor(a);
      const bMajor = isMajor(b);

      if (aMajor !== bMajor) {
        return aMajor ? -1 : 1;
      }

      return a.orb - b.orb;
    });
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[0.95rem] leading-[1.45] text-black/75">
      <span className="font-semibold text-black">{label}:</span> {value}
    </p>
  );
}

function parseDominantsElements(dominants: unknown): DominantsSummary | null {
  if (!dominants || typeof dominants !== "object" || Array.isArray(dominants)) {
    return null;
  }

  const elements = (dominants as { elements?: unknown }).elements;
  if (!elements || typeof elements !== "object" || Array.isArray(elements)) {
    return null;
  }

  const rec = elements as Record<string, unknown>;
  const fire = typeof rec.fire === "number" ? rec.fire : null;
  const earth = typeof rec.earth === "number" ? rec.earth : null;
  const air = typeof rec.air === "number" ? rec.air : null;
  const water = typeof rec.water === "number" ? rec.water : null;

  if (fire === null || earth === null || air === null || water === null) {
    return null;
  }

  return { fire, earth, air, water };
}

function formatSubjectDateTime(raw: string): { date: string; time: string } {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const [datePart, timePart] = raw.split(" ");
    return {
      date: datePart || raw,
      time: timePart || "-",
    };
  }

  return {
    date: parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    time: parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function formatUtcDateTime(raw: string): string | null {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().replace(".000Z", "Z");
}

function getSignedSpeed(planet: NatalPlanet): number | undefined {
  if (typeof planet.speed !== "number") {
    return undefined;
  }

  const magnitude = Math.abs(planet.speed);
  return planet.retrograde ? -magnitude : magnitude;
}

function getAspectPhase(
  aspect: NatalAspect,
  pointState: Map<string, { lon: number; speed?: number }>,
): AspectPhase {
  const p1 = pointState.get(aspect.p1.toLowerCase());
  const p2 = pointState.get(aspect.p2.toLowerCase());

  if (!p1 || !p2 || typeof p1.speed !== "number" || typeof p2.speed !== "number") {
    return "Unknown";
  }

  const deltaNow = normalizeSigned180(p2.lon - p1.lon);
  const orbNow = aspectOrbFromDelta(deltaNow, aspect.deg);
  const dtDays = 1 / 24;
  const deltaFuture = normalizeSigned180((p2.lon + p2.speed * dtDays) - (p1.lon + p1.speed * dtDays));
  const orbFuture = aspectOrbFromDelta(deltaFuture, aspect.deg);

  if (Math.abs(orbFuture - orbNow) < 0.0005) {
    return "Unknown";
  }

  return orbFuture < orbNow ? "Applying" : "Separating";
}

function normalizeAspectToken(token: string): string {
  const normalized = token.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "asc") return "ascendant";
  if (normalized === "mc") return "midheaven";
  return normalized;
}

function findAspectInterpretation(
  atoms: InterpretationAtom[],
  aspect: NatalAspect,
): InterpretationAtom | null {
  const p1 = normalizeAspectToken(aspect.p1);
  const p2 = normalizeAspectToken(aspect.p2);
  const type = normalizeAspectToken(aspect.type);
  const directKey = `aspect.${p1}.${type}.${p2}`;
  const reverseKey = `aspect.${p2}.${type}.${p1}`;

  const exact = atoms.find(
    (atom) =>
      atom.category === "aspect" &&
      (atom.key === directKey || atom.key === reverseKey),
  );
  if (exact) return exact;

  const loose = atoms.find((atom) => {
    if (atom.category !== "aspect") return false;
    const key = atom.key.toLowerCase();
    return key.includes(type) && key.includes(p1) && key.includes(p2);
  });

  return loose ?? null;
}

function normalizeSvgPlanetToken(token: string): string {
  const normalized = token.toLowerCase().trim();
  if (normalized === "true_node" || normalized === "mean_node") {
    return "north_node";
  }
  return normalized;
}

function resolvePlanetFromToken(
  token: string,
  chartPlanetMap: Map<string, NatalPlanet>,
): NatalPlanet | null {
  const normalizedToken = normalizeSvgPlanetToken(token);
  const exact = chartPlanetMap.get(normalizedToken);
  if (exact) return exact;

  // Fallback when SVG uses extended ids like "sun-glyph" / "planet-sun-symbol".
  for (const [key, planet] of chartPlanetMap.entries()) {
    if (normalizedToken.includes(key) || key.includes(normalizedToken)) {
      return planet;
    }
  }

  return null;
}

function normalizeTokenText(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function extractPlanetTokenFromElement(element: Element): string | null {
  const dataPlanet = element.getAttribute("data-planet");
  if (dataPlanet) {
    return normalizeSvgPlanetToken(normalizeTokenText(dataPlanet));
  }

  const dataBody = element.getAttribute("data-body");
  if (dataBody) {
    return normalizeSvgPlanetToken(normalizeTokenText(dataBody));
  }

  const id = (element.getAttribute("id") || "").toLowerCase();
  if (!id) return null;
  if (id.startsWith("sign-") || id.startsWith("house-")) return null;

  const normalizedId = normalizeTokenText(id);
  const explicit =
    normalizedId.match(/^planet_(.+)$/)?.[1] ??
    normalizedId.match(/^(.+)_planet(?:_.+)?$/)?.[1] ??
    normalizedId.match(/^(.+)_(?:glyph|symbol|label|marker|point)$/)?.[1] ??
    null;

  if (explicit) {
    return normalizeSvgPlanetToken(explicit);
  }

  const knownTokens = [
    "north_node",
    "true_node",
    "mean_node",
    "south_node",
    "lilith",
    "chiron",
    "mercury",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "venus",
    "mars",
    "moon",
    "sun",
    "ascendant",
    "asc",
    "midheaven",
    "mc",
    "vertex",
    "fortune",
  ];

  for (const token of knownTokens) {
    if (normalizedId.includes(token)) {
      return normalizeSvgPlanetToken(token);
    }
  }

  return null;
}

function signIdToAbbreviation(signId: string): string | null {
  const map: Record<string, string> = {
    aries: "Ari",
    taurus: "Tau",
    gemini: "Gem",
    cancer: "Can",
    leo: "Leo",
    virgo: "Vir",
    libra: "Lib",
    scorpio: "Sco",
    sagittarius: "Sag",
    capricorn: "Cap",
    aquarius: "Aqu",
    pisces: "Pis",
  };

  return map[signId.toLowerCase()] ?? null;
}

function parseHouseNumberFromSvgToken(token: string): number | null {
  const match = token.match(/^(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 1 || value > 12) return null;
  return value;
}

const ASPECT_LINE_STROKES = new Set(["#1a1a1a", "#c00000", "#0047ab", "#2e7d32"]);
const HIGHLIGHT_COLORS = ["#fff3a3", "#c7f4c2", "#b8e1ff", "#ffd4de"];
const EXPORT_SECTIONS: ExportSectionOption[] = [
  { id: "natal-wheel", label: "Natal Wheel" },
  { id: "asc-section", label: "1st House - ASC" },
  { id: "mc-section", label: "10th House - MC" },
  { id: "planet-sections", label: "Planet Interpretations" },
  { id: "all-aspects", label: "All Aspect Dynamics" },
  { id: "thematic-interpretation", label: "Thematic Interpretation" },
];

function normalizeAspectEndpointToken(token: string): string {
  const normalized = token.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "asc") return "ascendant";
  if (normalized === "mc") return "midheaven";
  if (normalized === "true_node" || normalized === "mean_node") return "north_node";
  return normalized;
}

function isAspectLineElement(el: Element): el is SVGLineElement {
  if (!(el instanceof SVGLineElement)) return false;
  const stroke = (el.getAttribute("stroke") || "").trim().toLowerCase();
  return ASPECT_LINE_STROKES.has(stroke);
}

function isInteractiveAspectLine(el: Element): el is SVGLineElement {
  if (!(el instanceof SVGLineElement)) return false;
  return Boolean(el.getAttribute("data-key")) || isAspectLineElement(el);
}

function getAspectLineKey(el: SVGLineElement): string {
  const dataKey = el.getAttribute("data-key");
  if (dataKey) {
    return `data:${dataKey.toLowerCase()}`;
  }

  return [
    el.getAttribute("x1") || "",
    el.getAttribute("y1") || "",
    el.getAttribute("x2") || "",
    el.getAttribute("y2") || "",
    (el.getAttribute("stroke") || "").toLowerCase(),
    el.getAttribute("stroke-width") || "",
  ].join("|");
}

function isNodePlanet(planet: NatalPlanet): boolean {
  const id = planet.id.toLowerCase();
  const name = planet.name.toLowerCase();
  return id.includes("node") || name.includes("node");
}

function isLilithPlanet(planet: NatalPlanet): boolean {
  const id = planet.id.toLowerCase();
  const name = planet.name.toLowerCase();
  return id.includes("lilith") || name.includes("lilith");
}

function isChironPlanet(planet: NatalPlanet): boolean {
  const id = planet.id.toLowerCase();
  const name = planet.name.toLowerCase();
  return id.includes("chiron") || name.includes("chiron");
}

export function ReportView({ data, chartSvg }: ReportViewProps) {
  const [aspectModal, setAspectModal] = useState<AspectModalState | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [hoverPlanet, setHoverPlanet] = useState<HoverPlanetState | null>(null);
  const [selectedAspectLineKey, setSelectedAspectLineKey] = useState<string | null>(null);
  const [selectedAspectEndpoints, setSelectedAspectEndpoints] = useState<SelectedAspectEndpoints | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [, setHighlightRevision] = useState(0);
  const [highlightMenu, setHighlightMenu] = useState<HighlightMenuState | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportSectionIds, setSelectedExportSectionIds] = useState<string[]>(
    EXPORT_SECTIONS.map((section) => section.id),
  );
  const [includeHighlightsInExport, setIncludeHighlightsInExport] = useState(true);
  const [exportError, setExportError] = useState<string | null>(null);
  const highlightSequenceRef = useRef(0);
  const keepHighlightMenuOnNextClickRef = useRef(false);
  const reportTextRootRef = useRef<HTMLDivElement | null>(null);
  const rightColumnContentRef = useRef<HTMLDivElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartSvgHostRef = useRef<HTMLDivElement | null>(null);
  const asc = data.angles_details.asc;
  const mc = data.angles_details.mc;
  const allAspects = sortAspects(dedupeAspects(data.aspects));
  const interpretationSections = organizeInterpretationSections(data.interpretation);
  const atoms = parseInterpretationAtoms(data.interpretation);
  const aspectAtoms = useMemo(
    () => atoms.filter((atom) => atom.category === "aspect"),
    [atoms],
  );
  const pointState = useMemo(() => {
    const map = new Map<string, { lon: number; speed?: number }>();

    for (const planet of data.planets) {
      const key = planet.id.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { lon: planet.abs_pos, speed: getSignedSpeed(planet) });
      }
    }

    map.set("asc", { lon: data.angles.asc, speed: 0 });
    map.set("ascendant", { lon: data.angles.asc, speed: 0 });
    map.set("mc", { lon: data.angles.mc, speed: 0 });
    map.set("midheaven", { lon: data.angles.mc, speed: 0 });

    return map;
  }, [data.planets, data.angles.asc, data.angles.mc]);

  const ascRulerName = asc ? RULERS[asc.sign] : undefined;
  const ascRulerPlanet = ascRulerName ? getPlanetByName(data.planets, ascRulerName) : undefined;
  const mcRulerName = mc ? RULERS[mc.sign] : undefined;
  const mcRulerPlanet = mcRulerName ? getPlanetByName(data.planets, mcRulerName) : undefined;
  const ascRulerSignBody = getAtomBody(atoms, ascRulerPlanet, "planet_sign");
  const ascRulerHouseBody = getAtomBody(atoms, ascRulerPlanet, "planet_house");
  const mcRulerSignBody = getAtomBody(atoms, mcRulerPlanet, "planet_sign");
  const mcRulerHouseBody = getAtomBody(atoms, mcRulerPlanet, "planet_house");
  const ascInterpretationAtoms = getAngleInterpretationAtoms(atoms, "ascendant");
  const mcInterpretationAtoms = getAngleInterpretationAtoms(atoms, "midheaven");
  const ascExplicitAspects = allAspects.filter((aspect) => {
    const left = aspect.p1.toLowerCase();
    const right = aspect.p2.toLowerCase();
    return left === "asc" || right === "asc" || left === "ascendant" || right === "ascendant";
  });
  const mcExplicitAspects = allAspects.filter((aspect) => {
    const left = aspect.p1.toLowerCase();
    const right = aspect.p2.toLowerCase();
    return left === "mc" || right === "mc" || left === "midheaven" || right === "midheaven";
  });
  const ascAspects = ascExplicitAspects.length
    ? ascExplicitAspects
    : deriveAngleAspects("asc", data.angles.asc, data.planets);
  const mcAspects = mcExplicitAspects.length
    ? mcExplicitAspects
    : deriveAngleAspects("mc", data.angles.mc, data.planets);
  const chartPlanetMap = useMemo(() => {
    const map = new Map<string, NatalPlanet>();
    for (const planet of data.planets) {
      const baseKey = normalizeSvgPlanetToken(planet.id);
      if (!map.has(baseKey)) {
        map.set(baseKey, planet);
      }

      if (planet.id === "north_node" && planet.variant) {
        const variantKey = normalizeSvgPlanetToken(`${planet.variant}_node`);
        map.set(variantKey, planet);
      }
    }
    return map;
  }, [data.planets]);
  const hoverPlanetInfo = useMemo(() => {
    if (!hoverPlanet) {
      return null;
    }

    if (hoverPlanet.kind === "planet") {
      const planet = resolvePlanetFromToken(hoverPlanet.token, chartPlanetMap);

      if (!planet) {
        return null;
      }

      const signBody = getAtomBody(atoms, planet, "planet_sign");
      const houseBody = getAtomBody(atoms, planet, "planet_house");
      const relatedAspects = atoms
        .filter((atom) => {
          if (atom.category !== "aspect") return false;
          const key = atom.key.toLowerCase();
          const title = atom.title.toLowerCase();
          return key.includes(planet.id.toLowerCase()) || title.includes(planet.name.toLowerCase());
        })
        .slice(0, 2);

      return { kind: "planet" as const, planet, signBody, houseBody, relatedAspects };
    }

    if (hoverPlanet.kind === "house") {
      const houseNumber = parseHouseNumberFromSvgToken(hoverPlanet.token);
      if (!houseNumber) {
        return null;
      }

      const house = data.houses.find((h) => h.house === houseNumber);
      if (!house) {
        return null;
      }

      const planetsInHouse = data.planets.filter((planet) => planet.house === houseNumber);
      const houseInterpretations = planetsInHouse
        .map((planet) => ({
          planet,
          body: getAtomBody(atoms, planet, "planet_house"),
        }))
        .filter((item): item is { planet: NatalPlanet; body: string } => Boolean(item.body))
        .slice(0, 3);

      return {
        kind: "house" as const,
        house,
        planetsInHouse,
        houseInterpretations,
      };
    }

    const signId = hoverPlanet.token.toLowerCase();
    const signAbbr = signIdToAbbreviation(signId);
    if (!signAbbr) {
      return null;
    }

    const planetsInSign = data.planets.filter((planet) => planet.sign_id?.toLowerCase() === signId || planet.sign === signAbbr);
    const signInterpretations = planetsInSign
      .map((planet) => ({
        planet,
        body: getAtomBody(atoms, planet, "planet_sign"),
      }))
      .filter((item): item is { planet: NatalPlanet; body: string } => Boolean(item.body))
      .slice(0, 3);

    return {
      kind: "sign" as const,
      signId,
      signAbbr,
      planetsInSign,
      signInterpretations,
    };
  }, [hoverPlanet, chartPlanetMap, atoms, data.planets, data.houses]);

  const orderedPlanets = PLANET_ORDER.map((id) => data.planets.find((p) => p.id === id)).filter(
    (p): p is NatalPlanet => Boolean(p),
  );
  const sidebarCorePlanets = data.planets.filter((planet) =>
    ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"].includes(
      planet.id.toLowerCase(),
    ),
  );
  const sidebarObjectsFromPlanets = data.planets.filter(
    (planet) => isNodePlanet(planet) || isLilithPlanet(planet) || isChironPlanet(planet),
  );
  const nodeObject = sidebarObjectsFromPlanets.find((planet) => isNodePlanet(planet));
  const lilithObject = sidebarObjectsFromPlanets.find((planet) => isLilithPlanet(planet));
  const chironObject = sidebarObjectsFromPlanets.find((planet) => isChironPlanet(planet));
  const fortunePoint = (data.angles_details as Record<string, { sign: string; pos: number } | undefined>).fortune;
  const vertexPoint = data.angles_details.vertex;
  const elements = parseDominantsElements(data.dominants);
  const subjectWhen = formatSubjectDateTime(data.subject.datetime);
  const subjectUtc = formatUtcDateTime(data.subject.datetime);
  const housePairs = [1, 2, 3, 4, 5, 6].map((houseNumber) => {
    const left = data.houses.find((house) => house.house === houseNumber);
    const right = data.houses.find((house) => house.house === houseNumber + 6);
    return { left, right };
  });
  const pageSummaryLinks = [
    { href: "#natal-wheel", label: "Natal Wheel" },
    { href: "#asc-section", label: "1st House - ASC" },
    { href: "#mc-section", label: "10th House Cusp - MC" },
    { href: "#planet-sections", label: "Planet Interpretations" },
    { href: "#all-aspects", label: "All Aspect Dynamics" },
    { href: "#thematic-interpretation", label: "Thematic Interpretation" },
  ];
  const highlightStorageKey = useMemo(
    () =>
      `report-highlights:v2:${data.subject.name}|${data.subject.datetime}|${data.subject.location.city}`,
    [data.subject.name, data.subject.datetime, data.subject.location.city],
  );
  const highlights = (() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(highlightStorageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item): item is StoredHighlight => {
          if (!item || typeof item !== "object") return false;
          const rec = item as Record<string, unknown>;
          return (
            typeof rec.id === "string" &&
            typeof rec.start === "number" &&
            typeof rec.end === "number" &&
            typeof rec.color === "string"
          );
        })
        .filter((item) => item.start >= 0 && item.end > item.start);
    } catch {
      return [];
    }
  })();

  const persistHighlights = useCallback((next: StoredHighlight[]) => {
    try {
      window.localStorage.setItem(highlightStorageKey, JSON.stringify(next));
    } catch {
      // Ignore storage write failures.
    }
    setHighlightRevision((current) => current + 1);
  }, [highlightStorageKey]);

  useEffect(() => {
    const host = chartSvgHostRef.current;
    if (!host) return;
    host.innerHTML = chartSvg ?? "";
  }, [chartSvg]);

  const applyChartSelectionStyles = useCallback(
    (selectedLineKey: string | null, selectedEndpoints: SelectedAspectEndpoints | null) => {
      const root = chartContainerRef.current;
      if (!root) return;

      const aspectPrimitives = Array.from(
        root.querySelectorAll('[data-key^="aspect."]'),
      ).filter((node): node is SVGElement => node instanceof SVGElement);
      let selectedAspectColor = "#000000";
      for (const primitive of aspectPrimitives) {
        if (!primitive.hasAttribute("data-original-opacity")) {
          primitive.setAttribute("data-original-opacity", primitive.getAttribute("opacity") ?? "__none__");
        }
        if (!primitive.hasAttribute("data-original-stroke-opacity")) {
          primitive.setAttribute(
            "data-original-stroke-opacity",
            primitive.getAttribute("stroke-opacity") ?? "__none__",
          );
        }

        const dataKey = primitive.getAttribute("data-key");
        const key = dataKey ? `data:${dataKey.toLowerCase()}` : "";
        const selected = Boolean(selectedLineKey) && key === selectedLineKey;
        if (!selectedLineKey) {
          primitive.style.opacity = "";
          primitive.style.strokeOpacity = "";
          const originalOpacity = primitive.getAttribute("data-original-opacity");
          const originalStrokeOpacity = primitive.getAttribute("data-original-stroke-opacity");
          if (originalOpacity && originalOpacity !== "__none__") {
            primitive.setAttribute("opacity", originalOpacity);
          } else {
            primitive.removeAttribute("opacity");
          }
          if (originalStrokeOpacity && originalStrokeOpacity !== "__none__") {
            primitive.setAttribute("stroke-opacity", originalStrokeOpacity);
          } else {
            primitive.removeAttribute("stroke-opacity");
          }
        } else {
          if (selected) {
            const strokeColor = primitive.getAttribute("stroke");
            if (strokeColor) {
              selectedAspectColor = strokeColor;
            }
            primitive.style.opacity = "";
            primitive.style.strokeOpacity = "";
            const originalOpacity = primitive.getAttribute("data-original-opacity");
            const originalStrokeOpacity = primitive.getAttribute("data-original-stroke-opacity");
            if (originalOpacity && originalOpacity !== "__none__") {
              primitive.setAttribute("opacity", originalOpacity);
            } else {
              primitive.removeAttribute("opacity");
            }
            if (originalStrokeOpacity && originalStrokeOpacity !== "__none__") {
              primitive.setAttribute("stroke-opacity", originalStrokeOpacity);
            } else {
              primitive.removeAttribute("stroke-opacity");
            }
          } else {
            const opacity = "0.04";
            primitive.style.opacity = opacity;
            primitive.style.strokeOpacity = opacity;
            primitive.setAttribute("opacity", opacity);
            primitive.setAttribute("stroke-opacity", opacity);
          }
        }
      }

      const planetElements = Array.from(
        root.querySelectorAll(
          '[id^="planet."],[data-key^="planet."],[id^="planet-"],[data-planet],[data-body]',
        ),
      ).filter((element) => extractPlanetTokenFromElement(element) !== null) as Element[];

      const setPlanetHighlight = (element: Element, active: boolean, color: string) => {
        const rootEl = element as SVGElement;
        if (!rootEl.hasAttribute("data-original-transform")) {
          rootEl.setAttribute("data-original-transform", rootEl.getAttribute("transform") ?? "__none__");
        }

        if (active) {
          try {
            const g = rootEl as unknown as SVGGraphicsElement;
            const box = g.getBBox();
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const originalTransform = rootEl.getAttribute("data-original-transform");
            const base = originalTransform && originalTransform !== "__none__" ? originalTransform : "";
            rootEl.setAttribute(
              "transform",
              `${base} translate(${cx} ${cy}) scale(1.3) translate(${-cx} ${-cy})`.trim(),
            );
          } catch {
            // If getBBox is unavailable, keep original transform.
          }
        } else {
          const originalTransform = rootEl.getAttribute("data-original-transform");
          if (originalTransform && originalTransform !== "__none__") {
            rootEl.setAttribute("transform", originalTransform);
          } else {
            rootEl.removeAttribute("transform");
          }
        }

        const svgNodes = [element, ...Array.from(element.querySelectorAll("*"))].filter(
          (node): node is SVGElement => node instanceof SVGElement,
        );

        for (const node of svgNodes) {
          const currentFill = node.getAttribute("fill");
          const currentStroke = node.getAttribute("stroke");

          if (!node.hasAttribute("data-original-fill")) {
            node.setAttribute("data-original-fill", currentFill ?? "__none__");
          }
          if (!node.hasAttribute("data-original-stroke")) {
            node.setAttribute("data-original-stroke", currentStroke ?? "__none__");
          }
          if (!node.hasAttribute("data-original-opacity")) {
            node.setAttribute("data-original-opacity", node.getAttribute("opacity") ?? "__none__");
          }
          if (!node.hasAttribute("data-original-stroke-opacity")) {
            node.setAttribute("data-original-stroke-opacity", node.getAttribute("stroke-opacity") ?? "__none__");
          }

          if (active) {
            if (currentFill && currentFill.toLowerCase() !== "none") {
              node.setAttribute("fill", color);
            }
            if (currentStroke && currentStroke.toLowerCase() !== "none") {
              node.setAttribute("stroke", color);
            }
            node.setAttribute("opacity", "1");
            node.setAttribute("stroke-opacity", "1");
          } else {
            const originalFill = node.getAttribute("data-original-fill");
            const originalStroke = node.getAttribute("data-original-stroke");
            const originalOpacity = node.getAttribute("data-original-opacity");
            const originalStrokeOpacity = node.getAttribute("data-original-stroke-opacity");
            if (originalFill && originalFill !== "__none__") {
              node.setAttribute("fill", originalFill);
            } else {
              node.removeAttribute("fill");
            }
            if (originalStroke && originalStroke !== "__none__") {
              node.setAttribute("stroke", originalStroke);
            } else {
              node.removeAttribute("stroke");
            }
            if (originalOpacity && originalOpacity !== "__none__") {
              node.setAttribute("opacity", originalOpacity);
            } else {
              node.removeAttribute("opacity");
            }
            if (originalStrokeOpacity && originalStrokeOpacity !== "__none__") {
              node.setAttribute("stroke-opacity", originalStrokeOpacity);
            } else {
              node.removeAttribute("stroke-opacity");
            }
          }
        }
      };

      if (!selectedEndpoints) {
        for (const element of planetElements) {
          setPlanetHighlight(element, false, selectedAspectColor);
        }
      } else {
        const p1 = normalizeAspectEndpointToken(selectedEndpoints.p1);
        const p2 = normalizeAspectEndpointToken(selectedEndpoints.p2);
        for (const element of planetElements) {
          const token = extractPlanetTokenFromElement(element);
          if (!token) continue;
          const normalizedToken = normalizeAspectEndpointToken(token);
          const isMatch = normalizedToken === p1 || normalizedToken === p2;
          setPlanetHighlight(element, isMatch, selectedAspectColor);
        }
      }
    },
    [],
  );

  useEffect(() => {
    function updateSummaryVisibility() {
      const contentEl = rightColumnContentRef.current;
      if (!contentEl || window.innerWidth < 1024) {
        setShowSummary(false);
        return;
      }

      const rect = contentEl.getBoundingClientRect();
      const threshold = window.innerHeight - 120;
      setShowSummary(rect.bottom <= threshold);
    }

    updateSummaryVisibility();
    window.addEventListener("scroll", updateSummaryVisibility, { passive: true });
    window.addEventListener("resize", updateSummaryVisibility);

    return () => {
      window.removeEventListener("scroll", updateSummaryVisibility);
      window.removeEventListener("resize", updateSummaryVisibility);
    };
  }, [highlights, persistHighlights]);

  useEffect(() => {
    applyChartSelectionStyles(selectedAspectLineKey, selectedAspectEndpoints);
  }, [chartSvg, selectedAspectLineKey, selectedAspectEndpoints, applyChartSelectionStyles]);

  // Some browsers/SVG updates can recreate inner SVG nodes on hover.
  // Re-apply active selection styles so dimming remains persistent.
  useLayoutEffect(() => {
    if (!selectedAspectLineKey) return;
    applyChartSelectionStyles(selectedAspectLineKey, selectedAspectEndpoints);
  }, [hoverPlanet, selectedAspectLineKey, selectedAspectEndpoints, applyChartSelectionStyles]);

  useEffect(() => {
    function onWindowScroll() {
      setHoverPlanet(null);
    }

    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, [highlights, persistHighlights]);

  useEffect(() => {
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useLayoutEffect(() => {
    const root = reportTextRootRef.current;
    if (!root) return;

    const existing = Array.from(root.querySelectorAll("span[data-user-highlight-id]"));
    for (const span of existing) {
      const parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      parent.normalize();
    }

    if (!highlights.length) {
      return;
    }

    const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

    for (const highlight of sortedHighlights) {
      if (highlight.end <= highlight.start) continue;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let currentOffset = 0;
      let node = walker.nextNode();

      while (node) {
        const textNode = node as Text;
        const value = textNode.nodeValue ?? "";
        const len = value.length;
        const nextOffset = currentOffset + len;

        const overlapStart = Math.max(highlight.start, currentOffset);
        const overlapEnd = Math.min(highlight.end, nextOffset);

        if (overlapEnd > overlapStart && len > 0) {
          const localStart = overlapStart - currentOffset;
          const localEnd = overlapEnd - currentOffset;

          let segmentNode = textNode;
          if (localStart > 0) {
            segmentNode = textNode.splitText(localStart);
          }
          if (localEnd - localStart < segmentNode.length) {
            segmentNode.splitText(localEnd - localStart);
          }

          const marker = document.createElement("span");
          marker.setAttribute("data-user-highlight-id", highlight.id);
          marker.style.backgroundColor = highlight.color;
          marker.style.cursor = "text";
          marker.style.userSelect = "text";
          marker.style.webkitUserSelect = "text";
          marker.style.borderRadius = "2px";
          marker.title = "Click to remove highlight";
          const parent = segmentNode.parentNode;
          if (parent) {
            parent.replaceChild(marker, segmentNode);
            marker.appendChild(segmentNode);
          }
        }

        currentOffset = nextOffset;
        node = walker.nextNode();
      }
    }
  }, [highlights]);

  useEffect(() => {
    const getRoot = () => reportTextRootRef.current;

    const resolveElement = (node: Node | null): Element | null => {
      if (!node) return null;
      if (node instanceof Element) return node;
      return node.parentElement;
    };

    const isInHighlightScope = (node: Node | null): boolean => {
      const el = resolveElement(node);
      if (!el) return false;
      if (el.closest("#natal-wheel")) return false;
      return Boolean(el.closest('[data-highlight-scope="true"]'));
    };

    const toTextOffset = (node: Node, offset: number): number => {
      const root = getRoot();
      if (!root) return 0;
      const range = document.createRange();
      range.selectNodeContents(root);
      range.setEnd(node, offset);
      return range.toString().length;
    };

    const syncHighlightMenuFromSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      const root = getRoot();
      if (!root) {
        setHighlightMenu(null);
        return;
      }

      const range = selection.getRangeAt(0);
      if (!isInHighlightScope(range.startContainer) || !isInHighlightScope(range.endContainer)) {
        setHighlightMenu(null);
        return;
      }

      const startHighlightEl =
        range.startContainer instanceof Element
          ? range.startContainer.closest("span[data-user-highlight-id]")
          : range.startContainer.parentElement?.closest("span[data-user-highlight-id]");
      const endHighlightEl =
        range.endContainer instanceof Element
          ? range.endContainer.closest("span[data-user-highlight-id]")
          : range.endContainer.parentElement?.closest("span[data-user-highlight-id]");
      if (startHighlightEl || endHighlightEl) {
        setHighlightMenu(null);
        return;
      }

      let start = 0;
      let end = 0;
      try {
        start = toTextOffset(range.startContainer, range.startOffset);
        end = toTextOffset(range.endContainer, range.endOffset);
      } catch {
        setHighlightMenu(null);
        return;
      }
      if (end <= start) {
        setHighlightMenu(null);
        return;
      }

      if (!selection.toString().trim()) {
        setHighlightMenu(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      keepHighlightMenuOnNextClickRef.current = true;
      setHighlightMenu({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
        start,
        end,
      });
    };

    const onMouseUp = () => {
      syncHighlightMenuFromSelection();
    };

    const onSelectionChange = () => {
      syncHighlightMenuFromSelection();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const marker = target?.closest?.("span[data-user-highlight-id]");
      if (marker instanceof HTMLElement) {
        const selection = window.getSelection();
        const hasActiveSelection = Boolean(
          selection &&
          !selection.isCollapsed &&
          selection.rangeCount > 0 &&
          selection.toString().trim(),
        );
        if (hasActiveSelection) {
          return;
        }

        const id = marker.getAttribute("data-user-highlight-id");
        if (id) {
          persistHighlights(highlights.filter((item) => item.id !== id));
          setHighlightMenu(null);
          window.getSelection()?.removeAllRanges();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (target && !target.closest('[data-highlight-menu="true"]')) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.toString().trim()) {
          return;
        }

        if (keepHighlightMenuOnNextClickRef.current) {
          keepHighlightMenuOnNextClickRef.current = false;
          return;
        }
        setHighlightMenu(null);
      }
    };

    document.addEventListener("mouseup", onMouseUp, { passive: true });
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("click", onClick);
    };
  }, [highlights, persistHighlights]);

  function addHighlight(color: string) {
    if (!highlightMenu) return;
    const { start, end } = highlightMenu;
    const overlaps = highlights.some((item) => start < item.end && end > item.start);
    if (overlaps) {
      setHighlightMenu(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    highlightSequenceRef.current += 1;
    const id = `h-${start}-${end}-${highlightSequenceRef.current}`;
    persistHighlights([...highlights, { id, start, end, color }]);
    setHighlightMenu(null);
    window.getSelection()?.removeAllRanges();
  }

  function toggleExportSection(sectionId: string) {
    setSelectedExportSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    );
  }

  function buildExportSectionHtml(sectionId: string): string | null {
    const source = document.getElementById(sectionId);
    if (!source) return null;

    const clone = source.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("button").forEach((button) => button.remove());
    clone.querySelectorAll('[data-highlight-menu="true"]').forEach((menu) => menu.remove());
    if (sectionId === "natal-wheel") {
      const firstTitle = clone.querySelector("h2");
      if (firstTitle) {
        firstTitle.remove();
      }
    }

    if (!includeHighlightsInExport) {
      const highlightNodes = Array.from(clone.querySelectorAll("span[data-user-highlight-id]"));
      for (const node of highlightNodes) {
        const parent = node.parentNode;
        if (!parent) continue;
        while (node.firstChild) {
          parent.insertBefore(node.firstChild, node);
        }
        parent.removeChild(node);
        parent.normalize();
      }
    }

    return clone.outerHTML;
  }

  function exportSelectedSectionsToPdf() {
    setExportError(null);
    if (!selectedExportSectionIds.length) {
      setExportError("Choose at least one section.");
      return;
    }

    const sectionBlocks: string[] = [];
    for (const section of EXPORT_SECTIONS) {
      if (!selectedExportSectionIds.includes(section.id)) continue;
      const html = buildExportSectionHtml(section.id);
      if (!html) continue;
      sectionBlocks.push(`
        <article class="pdf-section">
          <h2 class="pdf-section-title">${section.label}</h2>
          ${html}
        </article>
      `);
    }

    if (!sectionBlocks.length) {
      setExportError("Could not read the selected sections.");
      return;
    }

    const copiedStyles = Array.from(document.head.querySelectorAll('style,link[rel="stylesheet"]'))
      .map((node) => node.outerHTML)
      .join("\n");
    const glyphFontUrl = `${window.location.origin}/fonts/starfont-sans.ttf`;
    const title = `${data.subject.name || "Natal Chart"} - Report`;
    const exportedAt = new Date().toLocaleString();
    const coverDate = new Date(data.subject.datetime);
    const displayDate = Number.isNaN(coverDate.getTime())
      ? data.subject.datetime
      : coverDate.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const displayTime = Number.isNaN(coverDate.getTime())
      ? "-"
      : coverDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    const location = data.subject.location.city || "-";
    const timezone = data.subject.location.timezone || "-";
    const system = `${data.subject.settings.house_system} / ${data.subject.settings.zodiac_type}`;
    const utcLine = subjectUtc ?? "-";
    const julianDay =
      typeof data.subject.settings.julian_day === "number"
        ? data.subject.settings.julian_day.toFixed(6)
        : "-";
    const julianDayTt =
      typeof data.subject.settings.julian_day_tt === "number"
        ? data.subject.settings.julian_day_tt.toFixed(6)
        : "-";

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${copiedStyles}
    <style>
      @font-face {
        font-family: "StarFont Sans";
        src: url("${glyphFontUrl}") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: block;
      }
      body { margin: 0; background: #fff; color: #111; }
      .pdf-root { max-width: 900px; margin: 0 auto; padding: 36px 28px 44px; }
      .pdf-cover {
        min-height: calc(297mm - 28mm);
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding-bottom: 20px;
        margin-bottom: 24px;
        page-break-after: always;
        break-after: page;
        position: relative;
      }
      .pdf-cover h1 { margin: 0; font-size: 36px; letter-spacing: 0.01em; }
      .pdf-subtitle { margin-top: 10px; font-size: 16px; color: rgba(0,0,0,0.75); }
      .pdf-cover-meta {
        margin-top: 24px;
        font-size: 13px;
        line-height: 1.6;
        color: rgba(0,0,0,0.78);
        white-space: pre-line;
      }
      .pdf-exported-at { margin-top: 14px; font-size: 12px; color: rgba(0,0,0,0.58); }
      .pdf-section { margin: 0 0 28px; break-inside: avoid; page-break-inside: avoid; }
      .pdf-section-title { margin: 0 0 12px; font-size: 20px; padding-bottom: 8px; }
      .pdf-powered-by {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        text-align: center;
        font-size: 12px;
        color: rgba(0,0,0,0.58);
      }
      .chart-svg { max-width: 760px; margin: 0 auto; }
      .pdf-root hr,
      .pdf-root [class*="border"] {
        border: 0 !important;
      }
      .pdf-root .astro-glyph {
        font-family: "StarFont Sans", sans-serif !important;
      }
      #all-aspects { margin-left: 0 !important; width: 100% !important; }
      #all-aspects > div { margin-left: 0 !important; margin-right: 0 !important; }
      #all-aspects table { margin: 0 !important; width: 100% !important; }
      #thematic-interpretation { margin-left: 0 !important; }
      #planet-sections article + article {
        page-break-before: always;
        break-before: page;
      }
      @page { size: A4; margin: 14mm; }
      @media print {
        .pdf-root { max-width: none; padding: 0; }
      }
    </style>
  </head>
  <body>
    <main class="pdf-root">
      <header class="pdf-cover">
        <h1>${data.subject.name || "Birth data"}</h1>
        <p class="pdf-subtitle">Full Astrology Report for ${data.subject.name || "this person"}</p>
        <p class="pdf-cover-meta">Date: ${displayDate}
Time: ${displayTime}
Timezone: ${timezone}
Location: ${location}
System: ${system}
UTC: ${utcLine}
Julian day: ${julianDay}
Julian day (TT): ${julianDayTt}</p>
        <p class="pdf-exported-at">Exported ${exportedAt} • Highlights ${includeHighlightsInExport ? "included" : "hidden"}</p>
        <p class="pdf-powered-by">Powered by Freeastroapi.com</p>
      </header>
      ${sectionBlocks.join("\n")}
    </main>
  </body>
</html>`;
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const frameDoc = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDoc || !frameWindow) {
      frame.remove();
      setExportError("Could not initialize PDF export frame.");
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    setIsExportModalOpen(false);

    const cleanup = () => {
      setTimeout(() => frame.remove(), 300);
    };
    frameWindow.onafterprint = cleanup;

    const launchPrint = () => {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };

    const waitForFontsThenPrint = () => {
      const fontsApi = frameDoc.fonts;
      if (fontsApi && typeof fontsApi.ready?.then === "function") {
        fontsApi.ready.then(() => setTimeout(launchPrint, 120)).catch(() => setTimeout(launchPrint, 120));
      } else {
        setTimeout(launchPrint, 200);
      }
    };

    if (frameDoc.readyState === "complete") {
      waitForFontsThenPrint();
    } else {
      frameWindow.addEventListener("load", waitForFontsThenPrint, { once: true });
    }
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
      <div className="space-y-12">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setHighlightMenu(null);
              setExportError(null);
              setIsExportModalOpen(true);
            }}
            className="border border-black bg-white px-4 py-2 text-sm"
          >
            Export PDF
          </button>
        </section>

        {chartSvg ? (
          <section id="natal-wheel" className="scroll-mt-8 border-b border-black/15 pb-10">
            <h2 className="mb-4 font-serif text-3xl tracking-tight">Natal Wheel</h2>
            <div
              ref={chartContainerRef}
              className="chart-svg mx-auto w-full max-w-[900px]"
              onMouseMove={(event) => {
                const offsets: Array<[number, number]> = [
                  [0, 0],
                  [8, 0],
                  [-8, 0],
                  [0, 8],
                  [0, -8],
                  [8, 8],
                  [8, -8],
                  [-8, 8],
                  [-8, -8],
                ];

                let hoverPlanetEl: Element | null = null;
                let hoverSignEl: Element | null = null;
                let hoverHouseEl: Element | null = null;
                for (const [dx, dy] of offsets) {
                  const stack = document.elementsFromPoint(event.clientX + dx, event.clientY + dy);
                  for (const el of stack) {
                    if (!(el instanceof Element)) continue;
                    if (!hoverPlanetEl) {
                      const planetCandidate = el.closest("[id],[data-planet],[data-body]");
                      if (planetCandidate && extractPlanetTokenFromElement(planetCandidate)) {
                        hoverPlanetEl = planetCandidate;
                      }
                    }
                    if (!hoverSignEl) {
                      hoverSignEl = el.closest('[id^="sign-"]');
                    }
                    if (!hoverHouseEl) {
                      hoverHouseEl = el.closest('[id^="house-"]');
                    }
                    if (hoverPlanetEl) break;
                  }
                  if (hoverPlanetEl) break;
                }

                // Fallback: if exact hit misses tiny glyph strokes, snap to nearest planet marker.
                if (!hoverPlanetEl && chartContainerRef.current) {
                  const planetNodes = Array.from(
                    chartContainerRef.current.querySelectorAll('[id],[data-planet],[data-body]'),
                  );
                  let best: { el: Element; dist: number } | null = null;

                  for (const node of planetNodes) {
                    if (!(node instanceof Element)) continue;
                    if (!extractPlanetTokenFromElement(node)) continue;
                    const rect = node.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    const dx = cx - event.clientX;
                    const dy = cy - event.clientY;
                    const dist = Math.hypot(dx, dy);

                    if (dist <= 22 && (!best || dist < best.dist)) {
                      best = { el: node, dist };
                    }
                  }

                  if (best) {
                    hoverPlanetEl = best.el;
                  }
                }

                const hoverElement = hoverPlanetEl ?? hoverSignEl ?? hoverHouseEl;
                if (!hoverElement) {
                  if (hoverPlanet) setHoverPlanet(null);
                } else {
                  const id =
                    hoverElement.getAttribute("id") ||
                    hoverElement.getAttribute("data-planet") ||
                    hoverElement.getAttribute("data-body") ||
                    "unknown";
                  const planetToken = extractPlanetTokenFromElement(hoverElement);
                  const kind = planetToken
                    ? "planet"
                    : id.startsWith("house-")
                      ? "house"
                      : "sign";
                  const token = kind === "planet"
                    ? planetToken ?? ""
                    : id.replace(/^planet-/, "").replace(/^sign-/, "").replace(/^house-/, "");

                  setHoverPlanet((current) => {
                    if (!token) return null;
                    if (current && current.kind === kind && current.token === token) {
                      return { ...current, x: event.clientX, y: event.clientY };
                    }
                    return { kind, token, x: event.clientX, y: event.clientY };
                  });
                }
              }}
              onClick={(event) => {
                const target = event.target as Element | null;
                const aspectElement = target?.closest?.('[data-key^="aspect."]');
                const line = target?.closest?.("line");
                const interactive = (aspectElement instanceof SVGElement && aspectElement.getAttribute("data-key"))
                  ? aspectElement
                  : line instanceof SVGLineElement && isInteractiveAspectLine(line)
                    ? line
                    : null;
                if (!interactive) {
                  setSelectedAspectLineKey(null);
                  setSelectedAspectEndpoints(null);
                  return;
                }

                const dataKey = interactive.getAttribute("data-key");
                const key = dataKey ? `data:${dataKey.toLowerCase()}` : getAspectLineKey(line as SVGLineElement);
                const isDeselect = selectedAspectLineKey === key;
                const nextLineKey = isDeselect ? null : key;
                setSelectedAspectLineKey(nextLineKey);
                if (isDeselect) {
                  setSelectedAspectEndpoints(null);
                  requestAnimationFrame(() => applyChartSelectionStyles(null, null));
                  return;
                }
                let p1 = interactive.getAttribute("data-p1");
                let p2 = interactive.getAttribute("data-p2");

                if ((!p1 || !p2) && dataKey) {
                  const parts = dataKey.toLowerCase().split(".");
                  // aspect.{p1}.{type}.{p2}
                  if (parts.length >= 4 && parts[0] === "aspect") {
                    p1 = parts[1];
                    p2 = parts[3];
                  }
                }

                if (p1 && p2) {
                  const endpoints = { p1, p2 };
                  setSelectedAspectEndpoints(endpoints);
                  requestAnimationFrame(() => applyChartSelectionStyles(nextLineKey, endpoints));
                } else {
                  setSelectedAspectEndpoints(null);
                  requestAnimationFrame(() => applyChartSelectionStyles(nextLineKey, null));
                }
              }}
              onMouseLeave={() => {
                setHoverPlanet(null);
              }}
            >
              <div ref={chartSvgHostRef} />
            </div>
          </section>
        ) : null}

        <div ref={reportTextRootRef} data-highlight-scope="true" className="space-y-12">
        <section id="asc-section" className="scroll-mt-8 border-b border-black/15 pb-10">
        {asc ? (
          <article className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-[128px_1fr] sm:gap-6">
            <div className="flex items-start justify-center sm:justify-start">
              <div className="flex h-28 w-28 items-center justify-center">
                <Glyph char={getBodyGlyph("asc")} className="text-5xl text-black" />
              </div>
            </div>

            <div>
              <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-black">
                {ordinal(1)} House - Ascendant (ASC)
                <span className="ml-2 text-[0.8em] font-normal text-black/85">
                  - Physical personality
                </span>
              </h2>
              <p className="mt-2 text-[1rem] leading-[1.5] text-black/85">
                Ascendant (ASC) symbolizes physical appearance, temperament, behavior, and first impression.
              </p>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">
                    Ascendant in {asc.sign}
                    <Glyph char={getSignGlyph(asc.sign)} className="ml-2 text-[1.05em] align-middle text-black" />
                  </p>
                  <div className="mt-2 space-y-1">
                    <MetaLine label="Placement" value={`ASC in ${asc.sign} at ${formatDegree(asc.pos)}`} />
                    <MetaLine label="Ruler" value={ascRulerName ?? "-"} />
                    {ascRulerPlanet ? (
                      <MetaLine
                        label="Ruler placement"
                        value={`${ascRulerPlanet.name} in ${ascRulerPlanet.sign}, ${ordinal(ascRulerPlanet.house)} house`}
                      />
                    ) : null}
                  </div>
                  <p className="mt-2 text-[0.98rem] leading-[1.5] text-black/85">
                    {buildAngleNarrative({
                      angleLabel: "Ascendant",
                      sign: asc.sign,
                      rulerName: ascRulerName,
                      rulerPlanet: ascRulerPlanet,
                    })}
                  </p>
                  {ascInterpretationAtoms.map((atom, index) => (
                    <div key={`asc-interp-${index}`} className="mt-3">
                      <p className="text-[1.08rem] font-semibold leading-tight text-black">{atom.title}</p>
                      <p className="mt-1 text-[0.98rem] leading-[1.5] text-black/85">{atom.body}</p>
                    </div>
                  ))}
                </div>
                {ascRulerPlanet ? (
                  <div>
                    <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">
                      The ruler of the Ascendant - {ascRulerPlanet.name}
                      <Glyph char={getBodyGlyph(ascRulerPlanet.id)} className="ml-2 text-[1.05em] align-middle" />
                    </p>
                    <div className="mt-2 space-y-1">
                      <MetaLine label="Ruler sign" value={ascRulerPlanet.sign} />
                      <MetaLine label="Ruler house" value={ordinal(ascRulerPlanet.house)} />
                    </div>
                    {ascRulerSignBody ? (
                      <p className="mt-2 text-[0.98rem] leading-[1.5] text-black/85">{ascRulerSignBody}</p>
                    ) : null}
                    {ascRulerHouseBody ? (
                      <p className="mt-2 text-[0.98rem] leading-[1.5] text-black/85">{ascRulerHouseBody}</p>
                    ) : null}
                  </div>
                ) : null}
                {ascAspects.length ? (
                  <div>
                    <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">ASC aspects</p>
                    <div className="mt-2 space-y-1.5">
                      {ascAspects.map((aspect, aspectIndex) => {
                        const strength = getAspectStrength(aspect.orb);
                        const other = aspect.p1.toLowerCase().includes("asc")
                          ? aspect.p2
                          : aspect.p1;
                        return (
                          <p key={`asc-${aspect.type}-${aspectIndex}`} className="text-[0.97rem] leading-[1.35]">
                            <Glyph char={getAspectGlyph(aspect.type)} className="mr-1.5 text-lg align-middle" />
                            <button
                              type="button"
                              onClick={() =>
                                setAspectModal({
                                  aspect,
                                  interpretation: findAspectInterpretation(aspectAtoms, aspect),
                                })
                              }
                              className="font-semibold text-[#d97a00] underline underline-offset-2"
                            >
                              {toTitleCase(aspect.type)} {formatPlanetKey(other)}
                            </button>
                            <span className="ml-2 text-black/55">
                              ({formatDegree(aspect.orb)}, {getAspectPhase(aspect, pointState)}, {strength.label}, {strength.score}/100)
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        ) : null}
        </section>

        <section id="mc-section" className="scroll-mt-8 border-b border-black/15 pb-10">
        {mc ? (
          <article className="grid grid-cols-1 gap-5 pt-2 sm:grid-cols-[128px_1fr] sm:gap-6">
            <div className="flex items-start justify-center sm:justify-start">
              <div className="flex h-28 w-28 items-center justify-center">
                <Glyph char={getBodyGlyph("mc")} className="text-5xl text-black" />
              </div>
            </div>

            <div>
              <h2 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-black">
                {ordinal(10)} House Cusp - Medium Coeli (MC)
                <span className="ml-2 text-[0.8em] font-normal text-black/85">
                  - {ordinal(10)} house cusp themes: career, prestige and reputation
                </span>
              </h2>
              <p className="mt-2 text-[1rem] leading-[1.5] text-black/85">
                Medium Coeli (MC), the {ordinal(10)} house cusp, symbolizes public status, vocation, reputation,
                authority, and long-term direction.
              </p>
              <div className="mt-6 space-y-5">
                <div>
                  <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">
                    MC in {mc.sign}
                    <Glyph char={getSignGlyph(mc.sign)} className="ml-2 text-[1.05em] align-middle text-black" />
                  </p>
                  <div className="mt-2 space-y-1">
                    <MetaLine label="Placement" value={`MC in ${mc.sign} at ${formatDegree(mc.pos)}`} />
                    <MetaLine label="Ruler" value={mcRulerName ?? "-"} />
                    {mcRulerPlanet ? (
                      <MetaLine
                        label="Ruler placement"
                        value={`${mcRulerPlanet.name} in ${mcRulerPlanet.sign}, ${ordinal(mcRulerPlanet.house)} house`}
                      />
                    ) : null}
                  </div>
                  <p className="mt-2 text-[0.98rem] leading-[1.5] text-black/85">
                    {buildAngleNarrative({
                      angleLabel: "MC",
                      sign: mc.sign,
                      rulerName: mcRulerName,
                      rulerPlanet: mcRulerPlanet,
                    })}
                  </p>
                  {mcInterpretationAtoms.map((atom, index) => (
                    <div key={`mc-interp-${index}`} className="mt-3">
                      <p className="text-[1.08rem] font-semibold leading-tight text-black">{atom.title}</p>
                      <p className="mt-1 text-[0.98rem] leading-[1.5] text-black/85">{atom.body}</p>
                    </div>
                  ))}
                </div>
                {mcRulerPlanet ? (
                  <div>
                    <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">
                      The ruler of the {ordinal(10)} House ({mcRulerPlanet.name})
                      <Glyph char={getBodyGlyph(mcRulerPlanet.id)} className="ml-2 text-[1.05em] align-middle" />
                    </p>
                    <div className="mt-2 space-y-1">
                      <MetaLine label="Ruler sign" value={mcRulerPlanet.sign} />
                      <MetaLine label="Ruler house" value={ordinal(mcRulerPlanet.house)} />
                    </div>
                    {mcRulerSignBody ? (
                      <p className="mt-2 text-[0.98rem] leading-[1.5] text-black/85">{mcRulerSignBody}</p>
                    ) : null}
                    {mcRulerHouseBody ? (
                      <p className="mt-2 text-[0.98rem] leading-[1.5] text-black/85">{mcRulerHouseBody}</p>
                    ) : null}
                  </div>
                ) : null}
                {mcAspects.length ? (
                  <div>
                    <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">MC aspects</p>
                    <div className="mt-2 space-y-1.5">
                      {mcAspects.map((aspect, aspectIndex) => {
                        const strength = getAspectStrength(aspect.orb);
                        const other = aspect.p1.toLowerCase().includes("mc")
                          || aspect.p1.toLowerCase().includes("midheaven")
                          ? aspect.p2
                          : aspect.p1;
                        return (
                          <p key={`mc-${aspect.type}-${aspectIndex}`} className="text-[0.97rem] leading-[1.35]">
                            <Glyph char={getAspectGlyph(aspect.type)} className="mr-1.5 text-lg align-middle" />
                            <button
                              type="button"
                              onClick={() =>
                                setAspectModal({
                                  aspect,
                                  interpretation: findAspectInterpretation(aspectAtoms, aspect),
                                })
                              }
                              className="font-semibold text-[#d97a00] underline underline-offset-2"
                            >
                              {toTitleCase(aspect.type)} {formatPlanetKey(other)}
                            </button>
                            <span className="ml-2 text-black/55">
                              ({formatDegree(aspect.orb)}, {getAspectPhase(aspect, pointState)}, {strength.label}, {strength.score}/100)
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        ) : null}
        </section>

        <section id="planet-sections" className="scroll-mt-8 border-b border-black/15 pb-10">
        <div className="space-y-10">
          {orderedPlanets.map((planet, planetIndex) => {
            const signAtom = atoms.find(
              (a) =>
                a.category === "planet_sign" &&
                (a.key.includes(`planet.${planet.id}.sign`) ||
                  a.title.toLowerCase().startsWith(`${planet.name.toLowerCase()} in `)),
            );

            const houseAtom = atoms.find(
              (a) =>
                a.category === "planet_house" &&
                (a.key.includes(`planet.${planet.id}.house`) ||
                  a.title.toLowerCase().startsWith(`${planet.name.toLowerCase()} in house`)),
            );

            const pAspects = planetAspects(allAspects, planet.id);

            return (
              <article
                key={planet.id}
                className={`grid grid-cols-1 gap-5 pt-6 sm:grid-cols-[128px_1fr] sm:gap-6 ${
                  planetIndex > 0 ? "border-t border-black/10" : ""
                }`}
              >
                <div className="flex items-start justify-center sm:justify-start">
                  <div className="flex h-28 w-28 items-center justify-center">
                    <Glyph char={getBodyGlyph(planet.id)} className="text-5xl text-black" />
                  </div>
                </div>

                <div>
                  <h3 className="text-[1.95rem] font-semibold leading-tight tracking-tight text-black">
                    {planet.name}
                    <span className="ml-2 text-[1.15rem] font-medium text-black/70">
                      - {PLANET_MEANINGS[planet.id] ?? "Core archetypal function"}
                    </span>
                  </h3>

                  <p className="mt-2 text-[1rem] leading-[1.5] text-black/85">
                    {PLANET_OVERVIEW[planet.id] ?? `${planet.name} shows a core archetypal life function.`}
                  </p>

                  <div className="mt-6 space-y-5">
                    <div>
                      <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">
                        {planet.name} in {planet.sign}
                        <Glyph char={getSignGlyph(planet.sign)} className="ml-2 text-[1.05em] align-middle text-black" />
                      </p>
                      <p className="mt-1 text-[0.98rem] leading-[1.5] text-black/85">
                        {signAtom?.body ?? `${planet.name} in ${planet.sign}.`}
                      </p>
                    </div>

                    <div>
                      <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">
                        {planet.name} in the {ordinal(planet.house)} House
                      </p>
                      <p className="mt-1 text-[0.98rem] leading-[1.5] text-black/85">
                        {houseAtom?.body ?? `${planet.name} is emphasized in ${ordinal(planet.house)} house topics.`}
                      </p>
                    </div>

                    <div>
                      <p className="text-[1.45rem] font-semibold leading-tight tracking-tight text-black">{planet.name} aspects</p>
                      <div className="mt-2 space-y-1.5">
                        {pAspects.length ? (
                          pAspects.map((aspect, aspectIndex) => {
                            const strength = getAspectStrength(aspect.orb);
                            const other = aspect.p1 === planet.id ? aspect.p2 : aspect.p1;
                            return (
                              <p key={`${planet.id}-${aspect.type}-${aspectIndex}`} className="text-[0.97rem] leading-[1.35]">
                                <Glyph char={getAspectGlyph(aspect.type)} className="mr-1.5 text-lg align-middle" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAspectModal({
                                      aspect,
                                      interpretation: findAspectInterpretation(aspectAtoms, aspect),
                                    })
                                  }
                                  className="font-semibold text-[#d97a00] underline underline-offset-2"
                                >
                                  {toTitleCase(aspect.type)} {formatPlanetKey(other)}
                                </button>
                                <span className="ml-2 text-black/55">
                                  ({formatDegree(aspect.orb)}, {getAspectPhase(aspect, pointState)}, {strength.label}, {strength.score}/100)
                                </span>
                              </p>
                            );
                          })
                        ) : (
                          <p className="text-sm text-black/70">No aspects listed.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        </section>

        <section id="all-aspects" className="scroll-mt-8 border border-black/10 p-6 sm:ml-[152px] sm:w-[calc(100%+152px)] sm:p-8">
        <h2 className="font-serif text-3xl tracking-tight">All Aspect Dynamics</h2>
        {allAspects.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-black/15 text-left">
                  <th className="px-2 py-2 font-semibold">Aspect</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 font-semibold">Phase</th>
                  <th className="px-2 py-2 font-semibold">Orb</th>
                  <th className="px-2 py-2 font-semibold">Strength</th>
                  <th className="px-2 py-2 font-semibold">Class</th>
                </tr>
              </thead>
              <tbody>
                {allAspects.map((aspect, index) => {
                  const strength = getAspectStrength(aspect.orb);
                  const phase = getAspectPhase(aspect, pointState);

                  return (
                    <tr key={`${aspect.p1}-${aspect.p2}-${aspect.type}-${index}`} className="border-b border-black/10">
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <Glyph char={getBodyGlyph(aspect.p1)} className="text-base" />
                          <span>{formatPlanetKey(aspect.p1)}</span>
                          <Glyph char={getAspectGlyph(aspect.type)} className="text-base" />
                          <span>{formatPlanetKey(aspect.p2)}</span>
                          <Glyph char={getBodyGlyph(aspect.p2)} className="text-base" />
                        </span>
                      </td>
                      <td className="px-2 py-2">{toTitleCase(aspect.type)} ({aspect.deg}°)</td>
                      <td className="px-2 py-2">{phase}</td>
                      <td className="px-2 py-2">{formatDegree(aspect.orb)}</td>
                      <td className="px-2 py-2">{strength.label} ({strength.score}/100)</td>
                      <td className="px-2 py-2">{aspect.is_major ? "Major" : "Minor"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm">No aspects returned.</p>
        )}
        </section>

        <section id="thematic-interpretation" className="scroll-mt-8 border border-black/10 p-6 sm:ml-[152px] sm:p-8">
        <h2 className="mb-4 font-serif text-3xl tracking-tight">Thematic Interpretation</h2>
        {interpretationSections.length ? (
          <div className="space-y-8">
            {interpretationSections.map((section) => (
              <article key={section.key}>
                <h3 className="mb-3 text-lg font-semibold">{section.title}</h3>
                <div className="space-y-3">
                  {section.items.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="text-sm leading-7">
                      <p className="font-semibold">{item.title}</p>
                      <p>{item.body}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm">No interpretation text returned by API.</p>
        )}
        </section>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div ref={rightColumnContentRef} className="space-y-8 border-l border-black/15 pl-6">
          <section className="border-b border-black/15 pb-6">
            <p className="text-[1.65rem] font-semibold leading-tight tracking-tight text-black">
              {data.subject.name || "Birth data"}
            </p>
            <div className="mt-3 space-y-1 text-sm text-black/75">
              <p>
                <span className="font-semibold text-black">Date:</span> {subjectWhen.date}
              </p>
              <p>
                <span className="font-semibold text-black">Time:</span> {subjectWhen.time}
              </p>
              <p>
                <span className="font-semibold text-black">Timezone:</span> {data.subject.location.timezone}
              </p>
              <p>
                <span className="font-semibold text-black">Location:</span> {data.subject.location.city}
              </p>
              <p>
                <span className="font-semibold text-black">System:</span> {data.subject.settings.house_system} /{" "}
                {data.subject.settings.zodiac_type}
              </p>
              {subjectUtc ? (
                <p>
                  <span className="font-semibold text-black">UTC:</span> {subjectUtc}
                </p>
              ) : null}
              {typeof data.subject.settings.julian_day === "number" ? (
                <p>
                  <span className="font-semibold text-black">Julian day:</span>{" "}
                  {data.subject.settings.julian_day.toFixed(6)}
                </p>
              ) : null}
              {typeof data.subject.settings.julian_day_tt === "number" ? (
                <p>
                  <span className="font-semibold text-black">Julian day (TT):</span>{" "}
                  {data.subject.settings.julian_day_tt.toFixed(6)}
                </p>
              ) : null}
            </div>
          </section>

          <section className="border-b border-black/15 pb-6">
            <p className="text-[1.2rem] font-semibold text-black">Planet positions</p>
            <div className="mt-3 space-y-1.5">
              {sidebarCorePlanets.map((planet) => (
                <p key={`side-${planet.id}`} className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-2 text-[0.95rem]">
                  <Glyph char={getBodyGlyph(planet.id)} className="text-lg" />
                  <span>{planet.name}</span>
                  <span className="whitespace-nowrap">
                    {planet.sign}
                    <Glyph char={getSignGlyph(planet.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                    {formatDegree(planet.pos)}
                  </span>
                  <span className="text-black/65">{planet.house}</span>
                </p>
              ))}
            </div>
          </section>

          <section className="border-b border-black/15 pb-6">
            <p className="text-[1.2rem] font-semibold text-black">Objects</p>
            <div className="mt-3 space-y-1.5">
              {[nodeObject, lilithObject, chironObject].map((planet, idx) => (
                <p key={`obj-core-${idx}`} className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-2 text-[0.95rem]">
                  <Glyph char={getBodyGlyph(planet?.id ?? "")} className="text-lg" />
                  <span>
                    {idx === 0 ? "Node (M)" : idx === 1 ? "Lilith" : "Chiron"}
                  </span>
                  <span className="whitespace-nowrap">
                    {planet ? (
                      <>
                        {planet.sign}
                        <Glyph char={getSignGlyph(planet.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                        {formatDegree(planet.pos)}
                      </>
                    ) : (
                      "Not returned"
                    )}
                  </span>
                  <span className="text-black/65">{planet ? planet.house : "-"}</span>
                </p>
              ))}
              {fortunePoint ? (
                <p className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-2 text-[0.95rem]">
                  <Glyph char={getBodyGlyph("fortune")} className="text-lg" />
                  <span>Fortune</span>
                  <span className="whitespace-nowrap">
                    {fortunePoint.sign}
                    <Glyph char={getSignGlyph(fortunePoint.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                    {formatDegree(fortunePoint.pos)}
                  </span>
                  <span className="text-black/65">-</span>
                </p>
              ) : null}
              {vertexPoint ? (
                <p className="grid grid-cols-[20px_1fr_auto_auto] items-center gap-2 text-[0.95rem]">
                  <Glyph char={getBodyGlyph("vertex")} className="text-lg" />
                  <span>Vertex</span>
                  <span className="whitespace-nowrap">
                    {vertexPoint.sign}
                    <Glyph char={getSignGlyph(vertexPoint.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                    {formatDegree(vertexPoint.pos)}
                  </span>
                  <span className="text-black/65">{vertexPoint.house}</span>
                </p>
              ) : null}
            </div>
          </section>

          <section className="border-b border-black/15 pb-6">
            <p className="text-[1.2rem] font-semibold text-black">Angles</p>
            <div className="mt-3 space-y-1.5 text-[0.95rem]">
              {asc ? (
                <p className="grid grid-cols-[56px_1fr] gap-2">
                  <span className="font-semibold">ASC</span>
                  <span className="whitespace-nowrap">
                    {asc.sign}
                    <Glyph char={getSignGlyph(asc.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                    {formatDegree(asc.pos)}
                  </span>
                </p>
              ) : null}
              {mc ? (
                <p className="grid grid-cols-[56px_1fr] gap-2">
                  <span className="font-semibold">MC</span>
                  <span className="whitespace-nowrap">
                    {mc.sign}
                    <Glyph char={getSignGlyph(mc.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                    {formatDegree(mc.pos)}
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          <section className="pb-6">
            <p className="text-[1.2rem] font-semibold text-black">Houses (Placidus)</p>
            <div className="mt-3 space-y-1.5">
              {housePairs.map(({ left, right }, index) => (
                <p key={`house-pair-${index}`} className="grid grid-cols-2 gap-4 text-[0.95rem]">
                  <span>
                    {left ? (
                      <>
                        {left.house}: {left.sign}
                        <Glyph char={getSignGlyph(left.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                        {formatDegree(left.pos)}
                      </>
                    ) : ""}
                  </span>
                  <span>
                    {right ? (
                      <>
                        {right.house}: {right.sign}
                        <Glyph char={getSignGlyph(right.sign)} className="ml-1 text-[1em] align-middle" />{" "}
                        {formatDegree(right.pos)}
                      </>
                    ) : ""}
                  </span>
                </p>
              ))}
            </div>
          </section>

          {elements ? (
            <section className="pb-6">
              <p className="text-[1.2rem] font-semibold text-black">Elements</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[0.95rem]">
                <p>Fire {Math.round(elements.fire * 100)}%</p>
                <p>Earth {Math.round(elements.earth * 100)}%</p>
                <p>Air {Math.round(elements.air * 100)}%</p>
                <p>Water {Math.round(elements.water * 100)}%</p>
              </div>
            </section>
          ) : null}
        </div>

      </aside>

      {showSummary ? (
        <div className="fixed bottom-6 z-30 hidden w-[300px] lg:block lg:right-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]">
          <section className="border border-black/15 bg-white p-4">
            <p className="text-[1.1rem] font-semibold text-black">Page Summary</p>
            <nav className="mt-2 space-y-1.5 text-[0.92rem]">
              {pageSummaryLinks.map((item) => (
                <a key={item.href} href={item.href} className="block text-black/80 underline underline-offset-2">
                  {item.label}
                </a>
              ))}
            </nav>
          </section>
        </div>
      ) : null}

      {hoverPlanet && hoverPlanetInfo ? (
        <div
          className="pointer-events-none fixed z-40 hidden w-[640px] max-w-[calc(100vw-1.5rem)] border border-black/20 bg-white p-3 lg:block"
          style={{
            left: `${
              Math.min(
                Math.max(12, hoverPlanet.x + 16),
                Math.max(12, viewport.width - Math.min(640, viewport.width - 24) - 12),
              )
            }px`,
            top: `${Math.max(12, Math.min(hoverPlanet.y + 16, viewport.height - 120))}px`,
          }}
        >
          {hoverPlanetInfo.kind === "planet" ? (
            <>
              <p className="text-[1rem] font-semibold text-black">
                {hoverPlanetInfo.planet.name} in {hoverPlanetInfo.planet.sign}
                {hoverPlanetInfo.planet.variant ? ` (${hoverPlanetInfo.planet.variant})` : ""}
              </p>
              <p className="mt-0.5 text-[0.85rem] text-black/70">
                {ordinal(hoverPlanetInfo.planet.house)} house • {formatDegree(hoverPlanetInfo.planet.pos)}
              </p>
              {hoverPlanetInfo.signBody ? (
                <p className="mt-2 text-[0.86rem] leading-[1.45] text-black/85">{hoverPlanetInfo.signBody}</p>
              ) : null}
              {hoverPlanetInfo.houseBody ? (
                <p className="mt-2 text-[0.86rem] leading-[1.45] text-black/85">{hoverPlanetInfo.houseBody}</p>
              ) : null}
              {hoverPlanetInfo.relatedAspects.length ? (
                <div className="mt-2 border-t border-black/10 pt-2">
                  {hoverPlanetInfo.relatedAspects.map((item, idx) => (
                    <p key={`hover-asp-${idx}`} className="text-[0.82rem] leading-[1.35] text-black/75">
                      {item.title}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : hoverPlanetInfo.kind === "sign" ? (
            <>
              <p className="text-[1rem] font-semibold text-black">
                Sign: {toTitleCase(hoverPlanetInfo.signId)} ({hoverPlanetInfo.signAbbr})
              </p>
              <p className="mt-0.5 text-[0.85rem] text-black/70">
                Planets in sign: {hoverPlanetInfo.planetsInSign.length || 0}
              </p>
              {hoverPlanetInfo.planetsInSign.length ? (
                <p className="mt-2 text-[0.85rem] text-black/80">
                  {hoverPlanetInfo.planetsInSign.map((planet) => planet.name).join(", ")}
                </p>
              ) : null}
              {hoverPlanetInfo.signInterpretations.length ? (
                <div className="mt-2 border-t border-black/10 pt-2">
                  {hoverPlanetInfo.signInterpretations.map((item, idx) => (
                    <p key={`hover-sign-${idx}`} className="mb-1 text-[0.82rem] leading-[1.35] text-black/75">
                      <span className="font-semibold text-black/85">{item.planet.name}:</span> {item.body}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[1rem] font-semibold text-black">
                House {hoverPlanetInfo.house.house} in {hoverPlanetInfo.house.sign}
              </p>
              <p className="mt-0.5 text-[0.85rem] text-black/70">
                Cusp: {formatDegree(hoverPlanetInfo.house.pos)}
              </p>
              <p className="mt-2 text-[0.85rem] text-black/80">
                Planets in house: {hoverPlanetInfo.planetsInHouse.length || 0}
              </p>
              {hoverPlanetInfo.planetsInHouse.length ? (
                <p className="mt-1 text-[0.85rem] text-black/80">
                  {hoverPlanetInfo.planetsInHouse.map((planet) => planet.name).join(", ")}
                </p>
              ) : null}
              {hoverPlanetInfo.houseInterpretations.length ? (
                <div className="mt-2 border-t border-black/10 pt-2">
                  {hoverPlanetInfo.houseInterpretations.map((item, idx) => (
                    <p key={`hover-house-${idx}`} className="mb-1 text-[0.82rem] leading-[1.35] text-black/75">
                      <span className="font-semibold text-black/85">{item.planet.name}:</span> {item.body}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {aspectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl border border-black bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-2xl">
                {toTitleCase(aspectModal.aspect.type)}{" "}
                {formatPlanetKey(aspectModal.aspect.p1)} - {formatPlanetKey(aspectModal.aspect.p2)}
              </h3>
              <button
                type="button"
                onClick={() => setAspectModal(null)}
                className="border border-black px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-black/70">
              Orb {formatDegree(aspectModal.aspect.orb)} • {aspectModal.aspect.deg}° •{" "}
              {getAspectPhase(aspectModal.aspect, pointState)}
            </p>
            {aspectModal.interpretation ? (
              <div className="mt-5 space-y-2">
                <p className="text-[1.1rem] font-semibold">{aspectModal.interpretation.title}</p>
                <p className="text-[0.98rem] leading-[1.55] text-black/85">{aspectModal.interpretation.body}</p>
              </div>
            ) : (
              <p className="mt-5 text-[0.98rem] leading-[1.55] text-black/75">
                No aspect interpretation text was returned for this aspect.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {isExportModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl border border-black bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-2xl">Export Report to PDF</h3>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="border border-black px-3 py-1 text-sm"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm text-black/75">
              Choose which sections to include. Your browser print dialog will open so you can save as PDF.
            </p>

            <div className="mt-5 space-y-2">
              {EXPORT_SECTIONS.map((section) => {
                const checked = selectedExportSectionIds.includes(section.id);
                return (
                  <label key={section.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExportSection(section.id)}
                    />
                    <span>{section.label}</span>
                  </label>
                );
              })}
            </div>

            <label className="mt-5 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeHighlightsInExport}
                onChange={(event) => setIncludeHighlightsInExport(event.target.checked)}
              />
              <span>Include highlighted text</span>
            </label>

            {exportError ? <p className="mt-3 text-sm text-[#b00020]">{exportError}</p> : null}

            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedExportSectionIds(EXPORT_SECTIONS.map((section) => section.id))}
                  className="border border-black px-3 py-1 text-sm"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedExportSectionIds([])}
                  className="border border-black px-3 py-1 text-sm"
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                onClick={exportSelectedSectionsToPdf}
                className="border border-black bg-black px-4 py-2 text-sm text-white"
              >
                Continue to PDF
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {highlightMenu ? (
        <div
          data-highlight-menu="true"
          className="fixed z-[60] flex items-center gap-1 rounded border border-black/20 bg-white p-1 shadow-sm"
          style={{
            left: `${Math.max(8, Math.min(highlightMenu.x - 74, viewport.width - 156))}px`,
            top: `${Math.max(8, highlightMenu.y - 40)}px`,
          }}
        >
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Highlight with ${color}`}
              title="Apply highlight"
              className="h-6 w-6 border border-black/20"
              style={{ backgroundColor: color }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                addHighlight(color);
              }}
            />
          ))}
        </div>
      ) : null}

    </div>
  );
}
