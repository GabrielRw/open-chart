const BODY_GLYPHS: Record<string, string> = {
  sun: "s",
  moon: "a",
  mercury: "f",
  venus: "g",
  mars: "h",
  jupiter: "j",
  saturn: "s",
  uranus: "F",
  neptune: "G",
  pluto: "J",
  north_node: "k",
  south_node: "?",
  ascendant: "1",
  asc: "1",
  midheaven: "3",
  mc: "3",
  vulcain: "V",
  earth: "E",
  lilith: "L",
  black_moon_lilith: "L",
  mean_lilith: "L",
  ceres: "C",
  chiron: "D",
  east_point: "2",
  fortune: "L",
  pallas: ":",
  vesta: "_",
  juno: ";",
  vertex: "!",
};

const SIGN_GLYPHS: Record<string, string> = {
  aries: "x",
  taurus: "c",
  gemini: "v",
  cancer: "b",
  leo: "n",
  virgo: "m",
  libra: "X",
  scorpio: "C",
  sagittarius: "V",
  capricorn: "B",
  aquarius: "N",
  pisces: "M",
  ari: "x",
  tau: "c",
  gem: "v",
  can: "b",
  leo_short: "n",
  vir: "m",
  lib: "X",
  sco: "C",
  sag: "V",
  cap: "B",
  aqu: "N",
  pis: "M",
};

const ASPECT_GLYPHS: Record<string, string> = {
  conjunction: "q",
  opposite: "p",
  opposition: "p",
  square: "t",
  trine: "u",
  sextile: "r",
  inconjunct: "o",
  semisextile: "w",
  semi_sextile: "w",
  semisquare: "e",
  semi_square: "e",
  sesquiquadrate: "Ž",
  quintile: "q",
};

export function getBodyGlyph(id: string): string {
  return BODY_GLYPHS[id.toLowerCase()] ?? "";
}

export function getSignGlyph(signOrId: string): string {
  const key = signOrId.toLowerCase();
  if (key === "leo") return SIGN_GLYPHS.leo_short;
  return SIGN_GLYPHS[key] ?? "";
}

export function getAspectGlyph(type: string): string {
  return ASPECT_GLYPHS[type.toLowerCase().replaceAll(" ", "_")] ?? "";
}
