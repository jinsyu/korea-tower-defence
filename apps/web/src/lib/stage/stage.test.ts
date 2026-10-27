// Pyeongchang test stage: spot sizes and labels at phone sizes (D63), board area (D64), balloons on the path (D16),
// at most N + 1 towers (D22) and the juice rules (D79), all without a browser.
import { readFileSync } from "node:fs";
import {
  anchorDistance,
  boardTowers,
  estimateLabelSize,
  LABEL_MAX_GAP,
  fixedRects,
  labelOverlaps,
  layoutStageLabels,
  overlapArea,
  parseStageFile,
  polylineDistance,
  type StageFile,
} from "@ktd/core";
import { describe, expect, it } from "vitest";
import { FAKE_ME, fakeGuardians } from "./fake-region";
import { fitBoard, isWide, mapBox, wideSideWidth } from "./layout";
import { balloonCenter, fxShown, leakRing } from "./draw";
import { StageSim, seededRng, type Fx, type StageEvent, type TowerInput } from "./sim";

const stage: StageFile = parseStageFile(
  JSON.parse(readFileSync(new URL("../../../public/stages/dev/32540.json", import.meta.url), "utf8")),
);

const measure = (vw: number, vh: number) => estimateLabelSize(isWide(vw, vh));

const SCREENS: [number, number][] = [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];

describe("test stage file", () => {
  it("has 6–14 representative spots, one my spot and 1–4 gates", () => {
    expect(stage.repSpots.length).toBeGreaterThanOrEqual(6);
    expect(stage.repSpots.length).toBeLessThanOrEqual(14);
    expect(stage.mySpot).toHaveLength(2);
    expect(stage.gates.length).toBeGreaterThanOrEqual(1);
    expect(stage.gates.length).toBeLessThanOrEqual(4);
    expect(Math.max(stage.board.width, stage.board.height)).toBeCloseTo(1000, 0);
  });
});

describe.each(SCREENS)("board at %i×%i (D63, D64)", (vw, vh) => {
  const box = mapBox(vw, vh);
  const v = fitBoard(box.w, box.h, stage.board);
  const spots = [...stage.repSpots, stage.mySpot].map(([x, y]) => [v.ox + x * v.s, v.oy + y * v.s] as const);

  it("shows the whole board inside the map area", () => {
    expect(v.ox).toBeGreaterThanOrEqual(0);
    expect(v.oy).toBeGreaterThanOrEqual(0);
    expect(v.ox + stage.board.width * v.s).toBeLessThanOrEqual(box.w);
    expect(v.oy + stage.board.height * v.s).toBeLessThanOrEqual(box.h);
  });

  it("keeps spots 44px or larger, 8px apart and on the map", () => {
    expect(v.D).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < spots.length; i++) {
      const [x, y] = spots[i]!;
      expect(x - v.D / 2).toBeGreaterThanOrEqual(0);
      expect(y - v.D / 2).toBeGreaterThanOrEqual(0);
      expect(x + v.D / 2).toBeLessThanOrEqual(box.w);
      expect(y + v.D / 2).toBeLessThanOrEqual(box.h);
      for (let j = i + 1; j < spots.length; j++) {
        const [x2, y2] = spots[j]!;
        // Edge gap of the two round spots (diameter D).
        const gap = Math.hypot(x - x2, y - y2) - v.D;
        expect(gap).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("places name labels clear of spots, gates, the base and each other", () => {
    const labels = layoutStageLabels(stage, v, measure(vw, vh));
    const rects = labels.map((l) => l.rect);
    const fixed = fixedRects(stage, v);
    expect(labels.filter((l) => l.kind === "gate")).toHaveLength(stage.paths.length);
    expect(labels.filter((l) => l.kind === "base")).toHaveLength(1);
    expect(labelOverlaps(rects, fixed.spots)).toBe(0);
    expect(labelOverlaps(rects, fixed.gates)).toBe(0);
    expect(labelOverlaps(rects, [fixed.base])).toBe(0);
    let between = 0;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlapArea(rects[i]!, rects[j]!) > 0.5) between++;
    expect(between).toBe(0);
    for (const r of rects) {
      expect(r.l).toBeGreaterThanOrEqual(0);
      expect(r.r).toBeLessThanOrEqual(box.w);
    }
  });

  it("keeps each base and gate label next to its marker", () => {
    const labels = layoutStageLabels(stage, v, measure(vw, vh)).filter((l) => l.kind !== "nb");
    for (const l of labels) expect(anchorDistance(l.anchor, l.rect) - l.anchorHalf).toBeLessThanOrEqual(LABEL_MAX_GAP + 0.01);
    // labelAnchorMaxDistPx: 44px on a phone, where markers are 44px.
    const maxDist = Math.max(...labels.map((l) => anchorDistance(l.anchor, l.rect)));
    if (vw <= 390) expect(maxDist).toBeLessThanOrEqual(44.01);
  });

  it("gives the board its share of the screen", () => {
    if (isWide(vw, vh)) {
      // Board on the left fills the height left over; the panel column is 360–520px.
      const side = wideSideWidth(vw);
      expect(side).toBeGreaterThanOrEqual(360);
      expect(side).toBeLessThanOrEqual(520);
      expect(box.x + box.w + 12 + side + 12).toBeCloseTo(vw, 5);
      expect(box.h).toBe(vh - 124);
    } else {
      expect(box.h / vh).toBeGreaterThanOrEqual(0.4);
    }
  });
});

const towersFor = (n: number): TowerInput[] => [
  ...stage.repSpots.slice(0, n).map((spot, i) => ({ spot, type: (["rapid", "splash", "slow"] as const)[i % 3], step: 60 + i * 40, pal: i, me: false })),
  { spot: stage.mySpot, type: "rapid", step: 47, pal: 0, me: true },
];

function makeSim(opts: { reduced?: boolean; wide?: boolean; wave?: number; perSec?: number } = {}) {
  const sim = new StageSim(stage, {
    region: { wave: opts.wave ?? 1284, best: 1290, perSec: opts.perSec ?? 38 },
    rng: seededRng(7),
    reduced: !!opts.reduced,
    wide: !!opts.wide,
    headOffset: () => [0, -14],
    balloonColor: () => "#FF3B30",
  });
  sim.setTowers(towersFor(stage.repSpots.length));
  const events: StageEvent[] = [];
  sim.on((e) => events.push(e));
  const run = (sec: number, check?: () => void) => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      sim.update(1 / 60);
      check?.();
    }
  };
  return { sim, events, run };
}

describe("balloons stay on the path every tick (D16)", () => {
  it.each([
    ["with towers", false],
    ["without towers (balloons walk to the hold limit)", true],
  ])("holds within 0.5 board units through held, boss and breach waves, %s", (_, empty) => {
    const { sim, run } = makeSim({ wave: 1288, perSec: empty ? 0 : 38 });
    if (empty) sim.setTowers([]);
    let checked = 0;
    const check = () => {
      for (const e of sim.enemies) {
        expect(polylineDistance(sim.enemyPos(e), stage.paths[e.path]!.points)).toBeLessThanOrEqual(0.5);
        checked++;
      }
    };
    run(130, check); // 1288 → 1289 → 1290 (boss wave)
    sim.startBreach();
    run(15, check);
    expect(checked).toBeGreaterThan(empty ? 20_000 : 2_000);
  });

  it("draws every balloon centred on its path (no bob or push) on a 360px board", () => {
    const box = mapBox(360, 640);
    const v = fitBoard(box.w, box.h, stage.board);
    const { sim, run } = makeSim({ wave: 1289 });
    let checked = 0;
    run(90, () => {
      for (const e of sim.enemies) {
        const [x, y] = balloonCenter(v, sim, e);
        const board: [number, number] = [(x - v.ox) / v.s, (y - v.oy) / v.s];
        expect(polylineDistance(board, stage.paths[e.path]!.points)).toBeLessThanOrEqual(0.5);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(10_000);
  });

  it("finishes every held wave inside its 60 seconds", () => {
    for (const wave of [1, 2, 3, 9, 10, 11, 1290]) {
      const { sim } = makeSim({ wave });
      sim.startWave();
      expect(sim.holdFinishSec()).toBeLessThan(stage.pace.waveSec);
    }
  });
});

describe("live board", () => {
  it("always has 3+ balloons on the board in the first 60 seconds (checked every 2 s)", () => {
    for (const wave of [1284, 1289, 1290, 7]) {
      const { sim, run } = makeSim({ wave });
      const counts: number[] = [];
      for (let t = 0; t <= 60; t += 2) {
        counts.push(sim.enemies.length);
        run(2);
      }
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("towers drawn (D22)", () => {
  it("never exceeds N + 1 for 1,000 fake guardians and always includes mine", () => {
    const guardians = fakeGuardians(1000);
    const n = stage.repSpots.length;
    for (const pts24 of [0, FAKE_ME.pts24, 1e9]) {
      const towers = boardTowers(guardians, { ...FAKE_ME, pts24 }, n);
      expect(towers.length).toBeLessThanOrEqual(n + 1);
      expect(towers.filter((t) => t.me)).toHaveLength(1);
    }
  });
});

describe("renderer under reduced motion (D79)", () => {
  const kinds: Fx["k"][] = ["stars", "splash", "bigboom", "upring", "leak", "pop", "pang", "num"];

  it("draws only the number and the breach ring", () => {
    expect(kinds.filter((k) => fxShown(k, true))).toEqual(["leak", "num"]);
    expect(kinds.every((k) => fxShown(k, false))).toBe(true);
  });

  it("keeps the breach ring still instead of a widening wave", () => {
    const frames = [0, 0.25, 0.5, 0.75, 1].map((p) => leakRing(p, 44, true));
    expect(new Set(frames.map((f) => JSON.stringify(f))).size).toBe(1);
    expect(leakRing(0, 44, false).r).toBeLessThan(leakRing(1, 44, false).r);
  });
});

describe("juice rules (D79)", () => {
  /** Answer shots, a boss wave, a new best, a breach and two look changes. */
  function scenario(reduced: boolean, wide: boolean) {
    const { sim, events, run } = makeSim({ reduced, wide, wave: 1289, perSec: 0 });
    run(2);
    for (let i = 0; i < 6; i++) {
      sim.meFire(12);
      run(0.5);
    }
    sim.setPerSec(400); // heavy barrage so the boss is shot down, not just popped at the hold limit
    run(60); // 1289 clears into 1290, a boss wave
    run(30);
    sim.clearAsRecord();
    run(1);
    sim.startBreach();
    run(12);
    sim.upgrade("mat", 50);
    sim.upgrade("look", 55);
    sim.upgrade("evo", 100);
    run(2);
    return events;
  }
  const count = (events: StageEvent[], kind: StageEvent["kind"]) => events.filter((e) => e.kind === kind).length;

  it("floats numbers only for my tower", () => {
    const events = scenario(false, false);
    const numbers = events.filter((e) => e.kind === "number");
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((e) => e.mine)).toBe(true);
  });

  it.each([
    [false, 2],
    [true, 4],
  ])("shakes only for boss pop, wave clear and breach, ≤150ms (wide %s, ≤%ipx)", (wide, maxAmp) => {
    const events = scenario(false, wide);
    const shakes = events.filter((e) => e.kind === "shake");
    expect(new Set(shakes.map((e) => e.cause))).toEqual(new Set(["boss-pop", "wave-clear", "breach"]));
    for (const s of shakes) {
      expect(s.ampPx).toBeLessThanOrEqual(maxAmp);
      expect(s.ms).toBeLessThanOrEqual(150);
    }
  });

  it("stops only the popping boss, for 50ms", () => {
    const events = scenario(false, false);
    const stops = events.filter((e) => e.kind === "hitstop");
    expect(stops.length).toBeGreaterThan(0);
    for (const s of stops) {
      expect(s.balloon).toBe("boss");
      expect(s.ms).toBe(50);
    }
  });

  it("has shake, hit stop, flash, confetti, light pillar and spotlight with motion on", () => {
    const events = scenario(false, true);
    for (const kind of ["shake", "hitstop", "flash", "confetti", "light-pillar", "spotlight"] as const) {
      expect(count(events, kind)).toBeGreaterThan(0);
    }
  });

  it("emits none of them under prefers-reduced-motion, but keeps numbers and banners", () => {
    const events = scenario(true, true);
    for (const kind of ["shake", "hitstop", "flash", "confetti", "light-pillar", "spotlight"] as const) {
      expect(count(events, kind)).toBe(0);
    }
    expect(count(events, "number")).toBeGreaterThan(0);
    expect(count(events, "banner")).toBeGreaterThan(0);
  });
});
