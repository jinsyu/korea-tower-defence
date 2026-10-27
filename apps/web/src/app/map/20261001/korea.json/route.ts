import { buildKoreaMap } from "@/lib/korea-map";

// Prerendered at build time: projected SVG paths for the region picker (and the national board in T8).
export function GET() {
  return Response.json(buildKoreaMap({ regionStep: 0.5, sidoStep: 1.5 }));
}
