"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_GRADE_BAND, type GradeBandId } from "@/lib/grade-bands";

// Choices made during the first-entry screens. Screen state only; the server keeps them from T11.
type StartFlow = {
  band: GradeBandId;
  setBand: (band: GradeBandId) => void;
  region: string | null;
  setRegion: (code: string) => void;
};

const StartFlowContext = createContext<StartFlow | null>(null);

export function StartFlowProvider({ children }: { children: ReactNode }) {
  const [band, setBand] = useState<GradeBandId>(DEFAULT_GRADE_BAND);
  const [region, setRegion] = useState<string | null>(null);
  return (
    <StartFlowContext.Provider value={{ band, setBand, region, setRegion }}>{children}</StartFlowContext.Provider>
  );
}

export function useStartFlow(): StartFlow {
  const flow = useContext(StartFlowContext);
  if (!flow) throw new Error("useStartFlow must be used inside StartFlowProvider");
  return flow;
}
