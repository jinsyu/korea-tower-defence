import { bandColor, fakeRegionStats } from "@/lib/fake-region-stats";
import { buildKoreaMap } from "@/lib/korea-map";

// Decorative nationwide map on the first screen, coloured by best-wave band. Served as a static SVG file
// (not inline) so the first page stays light.
const map = buildKoreaMap({ regionStep: 3, sidoStep: 50 });
const stats = fakeRegionStats(
  map.regions.map((r) => r.code),
  (code) => map.regions.find((r) => r.code === code)!.sidoCode,
);

export const HOME_MAP_SIZE = { width: map.width, height: map.height };

export function homeMapSvg(): string {
  const paths = map.regions.map((r) => `<path d="${r.d}" fill="${bandColor(stats.get(r.code)!)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}"><g stroke="#06102A" stroke-opacity="0.7" stroke-width="0.5" stroke-linejoin="round">${paths}</g></svg>`;
}
