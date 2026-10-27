// Stage file format: public/stages/<version>/<code>.json. Every coordinate is in board units (long side 1000).
import type { BoardPoint, BoardPolygon } from "./geometry.ts";

export const STAGE_FORMAT = 1;

export type StageGate = {
  /** Neighbour region code the gate faces. */
  code: string;
  /** Neighbour name for the "○○ 방면" label. */
  name: string;
  at: BoardPoint;
};

export type StagePath = {
  /** Index into gates. */
  gate: number;
  /** From the gate to the base. */
  points: BoardPoint[];
};

/** Screen pace only: balloons cross a path in travelSec, so a wave ends within waveSec on any board. */
export type StagePace = {
  waveSec: number;
  /** Spawns of one wave are spread over this many seconds (late ones that could not pop in time are skipped). */
  spawnWindowSec: number;
  travelSec: { normal: number; fast: number; king: number; boss: number };
  /** Balloons that reach the base on a breach wave. */
  leakSec: number;
};

export type StageSources = {
  boundary: string;
  roads: string;
  /** Set while the paths are not real roads (dev fixture). */
  fakeRoads?: boolean;
};

export type StageFile = {
  format: typeof STAGE_FORMAT;
  code: string;
  name: string;
  board: { width: number; height: number };
  region: BoardPolygon[];
  neighbors: { code: string; name: string; polygons: BoardPolygon[] }[];
  neighborLabels: { name: string; at: BoardPoint }[];
  backgroundRoads: BoardPoint[][];
  gates: StageGate[];
  paths: StagePath[];
  base: BoardPoint;
  repSpots: BoardPoint[];
  mySpot: BoardPoint;
  pace: StagePace;
  sources: StageSources;
};

const isPoint = (v: unknown): v is BoardPoint =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const isPoints = (v: unknown): v is BoardPoint[] => Array.isArray(v) && v.every(isPoint);

/** Shape check for a fetched stage file; throws with the first problem found. */
export function parseStageFile(json: unknown): StageFile {
  const s = json as Partial<StageFile> | null;
  const fail = (what: string): never => {
    throw new Error(`판 파일이 올바르지 않아요: ${what}`);
  };
  if (!s || typeof s !== "object") fail("객체가 아님");
  if (s!.format !== STAGE_FORMAT) fail(`형식 ${String(s!.format)}`);
  if (typeof s!.code !== "string" || typeof s!.name !== "string") fail("code·name");
  if (!s!.board || !(s!.board.width > 0) || !(s!.board.height > 0)) fail("board");
  if (!Array.isArray(s!.region) || s!.region.length === 0) fail("region");
  if (!Array.isArray(s!.gates) || s!.gates.length < 1 || s!.gates.length > 4) fail("gates 1~4");
  if (!Array.isArray(s!.paths) || s!.paths.length === 0) fail("paths");
  for (const p of s!.paths!) {
    if (!isPoints(p.points) || p.points.length < 2 || !s!.gates![p.gate]) fail("path");
  }
  if (!isPoint(s!.base) || !isPoint(s!.mySpot)) fail("base·mySpot");
  if (!isPoints(s!.repSpots) || s!.repSpots.length < 1) fail("repSpots");
  if (!s!.pace || !(s!.pace.waveSec > 0)) fail("pace");
  if (!Array.isArray(s!.neighbors) || !Array.isArray(s!.neighborLabels) || !Array.isArray(s!.backgroundRoads)) {
    fail("neighbors·backgroundRoads");
  }
  if (!s!.sources || typeof s!.sources.boundary !== "string") fail("sources");
  return s as StageFile;
}
