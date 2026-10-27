import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_URL,
  OG_FONT_SUBSET_TEXT,
  OG_LIVE_LABEL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  buildRobots,
  buildSitemap,
  pageMetadata,
  resolveSiteUrl,
} from "@/lib/site";

describe("resolveSiteUrl", () => {
  it("falls back to the production address when unset or blank", () => {
    expect(resolveSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(resolveSiteUrl("  ")).toBe(DEFAULT_SITE_URL);
    expect(DEFAULT_SITE_URL).toBe("https://korea-tower-defence.vercel.app");
  });

  it("strips trailing slashes", () => {
    expect(resolveSiteUrl("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(resolveSiteUrl("https://example.com//")).toBe("https://example.com");
  });
});

describe("SITE_DESCRIPTION", () => {
  it("is a Korean sentence of about 80-160 characters", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThanOrEqual(80);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(SITE_DESCRIPTION).toMatch(/[가-힣]/);
  });
});

describe("buildRobots", () => {
  it("allows all pages and points to the sitemap", () => {
    expect(buildRobots("https://a.test")).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://a.test/sitemap.xml",
    });
  });
});

describe("buildSitemap", () => {
  it("lists the public pages with absolute URLs", () => {
    const entries = buildSitemap("https://a.test");
    expect(entries.map((e) => e.url)).toEqual(["https://a.test/", "https://a.test/info"]);
  });
});

describe("pageMetadata", () => {
  it("sets title, description, canonical and full openGraph/twitter blocks", () => {
    const meta = pageMetadata({ title: "정보", description: "설명", path: "/info" });
    expect(meta.title).toBe("정보");
    expect(meta.description).toBe("설명");
    expect(meta.alternates?.canonical).toBe("/info");
    expect(meta.openGraph).toMatchObject({
      type: "website",
      locale: "ko_KR",
      siteName: "전국 시군구 타워 디펜스",
      title: "정보",
      description: "설명",
      url: "/info",
      images: ["/opengraph-image"],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["/opengraph-image"],
    });
  });
});

describe("pageMetadata for the home page", () => {
  it("uses the site name as an absolute title", () => {
    const meta = pageMetadata({ description: SITE_DESCRIPTION, path: "/" });
    expect(meta.title).toEqual({ absolute: "전국 시군구 타워 디펜스" });
    expect(meta.openGraph?.title).toBe("전국 시군구 타워 디펜스");
  });
});

describe("share image font subset", () => {
  it("covers every character drawn on the share image", () => {
    const drawn = `${OG_LIVE_LABEL}${SITE_NAME}${SITE_TAGLINE}`;
    const missing = [...drawn].filter((ch) => !OG_FONT_SUBSET_TEXT.includes(ch));
    expect(missing).toEqual([]);
  });
});
