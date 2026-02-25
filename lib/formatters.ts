export function formatDegree(value: number, precision = 2): string {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value.toFixed(precision)}°`;
}

export function formatSignPosition(sign: string, pos: number): string {
  return `${formatDegree(pos)} ${sign}`;
}

export function toTitleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPlanetKey(value: string): string {
  return toTitleCase(value);
}
