import type { MetadataRoute } from "next";
import { buildSitemap, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(siteUrl);
}
