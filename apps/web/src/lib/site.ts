import type { Metadata, MetadataRoute } from "next";

export const SITE_NAME = "전국 시군구 타워 디펜스";
export const SITE_SHORT_NAME = "타워 디펜스";
export const SITE_TAGLINE = "수학 문제를 풀어 우리 지역을 함께 지켜요";
export const SITE_DESCRIPTION =
  "초등학생이 수학 계산 문제를 풀며 우리 시·군·구를 친구들과 함께 24시간 지키는 타워 디펜스예요. 문제를 맞힐 때마다 내 타워가 자라고 우리 지역 화력이 세져요. 가입도 이름도 필요 없어요.";
export const OG_LIVE_LABEL = "LIVE 전국 185곳";
// Glyphs inside src/assets/fonts/black-han-sans-og-subset.ttf. When OG text changes, re-download the subset:
// fonts.googleapis.com/css2?family=Black+Han+Sans&text=<this string> -> the TTF url in the CSS.
export const OG_FONT_SUBSET_TEXT =
  "LIVE 전국 185곳전국 시군구 타워 디펜스수학 문제를 풀어 우리 지역을 함께 지켜요";
export const DEFAULT_SITE_URL = "https://korea-tower-defence.vercel.app";

export const THEME_COLOR = "#06102A";

const OG_IMAGE_PATH = "/opengraph-image";

export function resolveSiteUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_SITE_URL;
  return trimmed.replace(/\/+$/, "");
}

export const siteUrl = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export function buildRobots(baseUrl: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

const PUBLIC_PATHS = ["/"] as const;

export function buildSitemap(baseUrl: string): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${baseUrl}${path}` }));
}

// A page that sets openGraph/twitter replaces the parent's blocks entirely,
// so every page goes through this helper to keep shared fields and the share image.
export function pageMetadata({
  title,
  description,
  path,
}: {
  title?: string;
  description: string;
  path: string;
}): Metadata {
  const shownTitle = title ?? SITE_NAME;
  return {
    title: title ?? { absolute: SITE_NAME },
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: SITE_NAME,
      title: shownTitle,
      description,
      url: path,
      images: [OG_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      title: shownTitle,
      description,
      images: [OG_IMAGE_PATH],
    },
  };
}
