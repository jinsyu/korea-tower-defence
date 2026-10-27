"use client";

import type { TowerType } from "@ktd/core";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_GRADE_BAND, type GradeBandId } from "@/lib/grade-bands";
import type { Nickname } from "@/lib/fake-nicknames";

export type PickedRegion = { code: string; name: string };

// Choices made during the first-entry screens. Screen state only; the server keeps them from T11.
type StartFlow = {
  band: GradeBandId;
  setBand: (band: GradeBandId) => void;
  region: PickedRegion | null;
  setRegion: (region: PickedRegion) => void;
  nickSeed: number;
  setNickSeed: (seed: number) => void;
  nickname: Nickname | null;
  setNickname: (nickname: Nickname) => void;
  towerType: TowerType;
  setTowerType: (type: TowerType) => void;
};

const StartFlowContext = createContext<StartFlow | null>(null);

export function StartFlowProvider({ children }: { children: ReactNode }) {
  const [band, setBand] = useState<GradeBandId>(DEFAULT_GRADE_BAND);
  const [region, setRegion] = useState<PickedRegion | null>(null);
  const [nickSeed, setNickSeed] = useState(1);
  const [nickname, setNickname] = useState<Nickname | null>(null);
  const [towerType, setTowerType] = useState<TowerType>("rapid");
  return (
    <StartFlowContext.Provider
      value={{ band, setBand, region, setRegion, nickSeed, setNickSeed, nickname, setNickname, towerType, setTowerType }}
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
