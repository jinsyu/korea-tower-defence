import type { MetadataRoute } from "next";
import { buildRobots, siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(siteUrl);
}
