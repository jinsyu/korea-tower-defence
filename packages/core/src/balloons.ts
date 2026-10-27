// Balloon enemies on four axes: size, shape, colour, attachments (spec "풍선 적").

export type BalloonKind = "normal" | "fast" | "king" | "boss";

export const BALLOON_KINDS = [
  { kind: "normal", name: "보통", scale: 1, shape: "round" },
  { kind: "fast", name: "쌩쌩", scale: 0.8, shape: "tilted-drop" },
  { kind: "king", name: "왕", scale: 1.25, shape: "banded-round" },
  { kind: "boss", name: "대장", scale: 1.9, shape: "blimp" },
] as const satisfies readonly { kind: BalloonKind; name: string; scale: number; shape: string }[];

export function balloonScale(kind: BalloonKind): number {
  return BALLOON_KINDS.find((k) => k.kind === kind)!.scale;
}

export type BalloonHealthState = {
  /** Patch tapes on the boss: 1 at 66% or less, 2 at 33% or less. */
  tapes: 0 | 1 | 2;
  /** Boss is deflating (33% or less). */
  wrinkled: boolean;
  /** King has lost one rubber band (50% or less). */
  bandBroken: boolean;
};

/** Picture state for a balloon at health ratio hp (0..1). */
export function balloonHealthState(kind: BalloonKind, hp: number): BalloonHealthState {
  if (kind === "boss") {
    const tapes = hp <= 0.33 ? 2 : hp <= 0.66 ? 1 : 0;
    return { tapes, wrinkled: tapes === 2, bandBroken: false };
  }
  return { tapes: 0, wrinkled: false, bandBroken: kind === "king" && hp <= 0.5 };
}
