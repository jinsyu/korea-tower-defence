import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_LIVE_LABEL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// next/og's default font has no Hangul, so a committed subset (OFL, LICENSES/) is used: no network at build or run.
const font = await readFile(join(process.cwd(), "src/assets/fonts/black-han-sans-og-subset.ttf"));

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 80px",
          gap: 28,
          background: "radial-gradient(ellipse at 70% 40%, #1B3F86, #06102A 65%)",
          color: "#FFFFFF",
          fontFamily: "Black Han Sans",
        }}
      >
        <div style={{ display: "flex" }}>
          <span style={{ background: "#FF3B30", padding: "4px 18px", fontSize: 36 }}>{OG_LIVE_LABEL}</span>
        </div>
        <div style={{ fontSize: 100, lineHeight: 1.05, color: "#FFD60A" }}>{SITE_NAME}</div>
        <div style={{ fontSize: 48, color: "#FFFFFF" }}>{SITE_TAGLINE}</div>
      </div>
    ),
    { ...size, fonts: [{ name: "Black Han Sans", data: font, style: "normal", weight: 400 }] },
  );
}
