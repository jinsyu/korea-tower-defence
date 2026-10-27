"use client";

import type { RecoveryCode, TowerType } from "@ktd/core";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createCodeHandoff, type CodeHandoff } from "@/lib/code-handoff";
import { RegionPicker, type PickedRegion } from "@/components/korea-map/region-picker";
import type { Nick } from "@/lib/game-server";
import { DEFAULT_GRADE_BAND, type GradeBandId } from "@/lib/grade-bands";

// Choices made during the first-entry screens, sent to the server when the guardian is made (nick screen).
// The recovery code the server returns lives only here, in memory, until the code screen has shown it once.
type StartFlow = {
  band: GradeBandId;
  setBand: (band: GradeBandId) => void;
  region: PickedRegion | null;
  setRegion: (region: PickedRegion) => void;
  nickname: Nick | null;
  setNickname: (nickname: Nick) => void;
  towerType: TowerType;
  setTowerType: (type: TowerType) => void;
  /** A new recovery code from the server, for the code screen to show once (D4). */
  issueCode: (code: RecoveryCode) => void;
  issuedId: number;
  codeHandoff: CodeHandoff;
};

const StartFlowContext = createContext<StartFlow | null>(null);

export function StartFlowProvider({ children }: { children: ReactNode }) {
  const [band, setBand] = useState<GradeBandId>(DEFAULT_GRADE_BAND);
  const [region, setRegion] = useState<PickedRegion | null>(null);
  const [nickname, setNickname] = useState<Nick | null>(null);
  const [towerType, setTowerType] = useState<TowerType>("rapid");
  const [codeHandoff] = useState(createCodeHandoff);
  const [issuedId, setIssuedId] = useState(0);
  const issueCode = useCallback((code: RecoveryCode) => setIssuedId(codeHandoff.issue(code)), [codeHandoff]);
  return (
    <StartFlowContext.Provider
      value={{ band, setBand, region, setRegion, nickname, setNickname, towerType, setTowerType, issueCode, issuedId, codeHandoff }}
    >
      {children}
    </StartFlowContext.Provider>
  );
}

export function useStartFlow(): StartFlow {
  const flow = useContext(StartFlowContext);
  if (!flow) throw new Error("useStartFlow must be used inside StartFlowProvider");
  return flow;
}

/** Step 2 of the first entry: the picked region goes into the flow, then on to the nickname. */
export function StartRegionPicker() {
  const { setRegion } = useStartFlow();
  const router = useRouter();
  return (
    <RegionPicker
      onPick={(r) => {
        setRegion(r);
        router.push("/start/nick");
      }}
    />
  );
}
