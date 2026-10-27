// "내 기록 지우기" asks twice (spec D8). Cancel at any step goes back to the start and changes nothing.

export type DeleteStep = "idle" | "first" | "second" | "deleted";
export type DeleteAction = "start" | "confirm" | "cancel";

export function nextDeleteStep(step: DeleteStep, action: DeleteAction): DeleteStep {
  if (step === "deleted") return step;
  if (action === "cancel") return "idle";
  if (action === "start") return step === "idle" ? "first" : step;
  if (step === "first") return "second";
  if (step === "second") return "deleted";
  return step;
}
