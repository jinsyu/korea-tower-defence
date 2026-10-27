import type { Metadata } from "next";
import { AssetSheet } from "@/components/art/asset-sheet";

// Developer QA sheet for the tower and balloon art (spec D51, D78). Not linked anywhere.
export const metadata: Metadata = {
  title: "에셋 견본",
  robots: { index: false, follow: false },
};

export default function AssetsPage() {
  return <AssetSheet />;
}
