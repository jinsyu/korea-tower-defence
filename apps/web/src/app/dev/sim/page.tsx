import type { Metadata } from "next";
import { WaveSimClient } from "@/components/dev/wave-sim-client";

// Developer wave simulator for the lazy settling rules (spec D17~D19) and the pace bot tables (D49). Not linked anywhere.
export const metadata: Metadata = {
  title: "웨이브 시뮬레이터",
  robots: { index: false, follow: false },
};

export default function SimPage() {
  return <WaveSimClient />;
}
