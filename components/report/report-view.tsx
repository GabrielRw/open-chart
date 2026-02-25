"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  const rightColumnContentRef = useRef<HTMLDivElement | null>(null);
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
  }, []);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
      <div className="space-y-12">
        {chartSvg ? (
          <section id="natal-wheel" className="scroll-mt-8 border-b border-black/15 pb-10">
            <h2 className="mb-4 font-serif text-3xl tracking-tight">Natal Wheel</h2>
            <div className="chart-svg mx-auto w-full max-w-[900px]" dangerouslySetInnerHTML={{ __html: chartSvg }} />
          </section>
        ) : null}

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
    </div>
  );
}
