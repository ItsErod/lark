export type MotionChoice = "system" | "reduce" | "allow";

export function motionChoice(value: unknown): MotionChoice {
  return value === "reduce" || value === "allow" ? value : "system";
}

/** Game Mode is applied by the caller. This only decides the in-app override. */
export function prefersReduced(choice: MotionChoice, osReduced: boolean): boolean {
  if (choice === "reduce") return true;
  if (choice === "allow") return false;
  return osReduced;
}
