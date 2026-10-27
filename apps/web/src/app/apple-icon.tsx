import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "base64");

export default function AppleIcon() {
  return new ImageResponse(
    <img src={`data:image/svg+xml;base64,${svg}`} width={180} height={180} alt="" />,
    size,
  );
}
