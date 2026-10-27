import { homeMapSvg } from "@/lib/home-map-svg";

// Prerendered at build time: the decorative map on the first screen.
export function GET() {
  return new Response(homeMapSvg(), { headers: { "content-type": "image/svg+xml" } });
}
