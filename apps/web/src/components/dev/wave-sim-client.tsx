"use client";

import dynamic from "next/dynamic";

// Browser only: the page shows a time measured where it runs, which a server render could not match.
export const WaveSimClient = dynamic(() => import("./wave-sim").then((m) => m.WaveSim), {
  ssr: false,
  loading: () => <p className="p-3 font-bold">계산 중…</p>,
});
